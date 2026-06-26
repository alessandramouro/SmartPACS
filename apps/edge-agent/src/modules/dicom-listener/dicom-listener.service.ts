import * as path from 'path';

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseService } from '../../database/database.service';
import { QueueService } from '../queue/queue.service';

import { DicomParserService } from './dicom-parser.service';

/**
 * DICOM C-STORE SCP (Storage Service Class Provider)
 *
 * Implements a DICOM listener on TCP port 104 that accepts
 * C-STORE requests from ultrasound equipment and other modalities.
 *
 * Since Node.js doesn't have a native DICOM library with full
 * DIMSE support, in production this should wrap dcmtk's storescp
 * tool as a child process, monitoring its output and incoming files.
 * The implementation below shows the architecture and the file-watcher
 * approach that works with any DICOM SCP tool (storescp, orthanc, etc.).
 */
@Injectable()
export class DicomListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DicomListenerService.name);
  private dcmtkProcess?: ReturnType<typeof import('child_process').spawn>;
  private isRunning = false;
  private readonly aeTitle: string;
  private readonly port: number;
  private readonly storageDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly dicomParser: DicomParserService,
    private readonly queueService: QueueService,
    private readonly database: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.aeTitle = configService.get<string>('dicom.aeTitle', 'SMARTPACS');
    this.port = configService.get<number>('dicom.port', 104);
    this.storageDir = configService.get<string>('dicom.storageDirectory', './storage/received');
  }

  async onModuleInit() {
    await fs.ensureDir(this.storageDir);
    await this.startListener();
  }

  onModuleDestroy() {
    this.stopListener();
  }

  private async startListener() {
    try {
      // Attempt to start dcmtk storescp if available
      const { spawn } = await import('child_process');
      const storeScpCmd = process.platform === 'win32' ? 'storescp.exe' : 'storescp';

      // storescp takes the port as a positional argument — there is no --port flag.
      // --log-level is rejected when combined with --verbose/--debug/--quiet, so only one is used.
      const args = [
        '--aetitle', this.aeTitle,
        '--output-directory', this.storageDir,
        '--filename-extension', '.dcm',
        '--sort-on-study-uid', 'study_',
        '--verbose',
        this.port.toString(),
      ];

      // storescp has no CLI option to filter by calling AE title in this dcmtk build —
      // enforcing dicom.allowedCallingAeTitles would require an association negotiation
      // profile (--config-file), which isn't set up. Warn instead of silently ignoring it.
      const allowedAeTitles = this.configService.get<string[]>('dicom.allowedCallingAeTitles', []);
      if (allowedAeTitles.length > 0) {
        this.logger.warn(
          'dicom.allowedCallingAeTitles is set but cannot be enforced: storescp has no ' +
          '--calling-aetitle option in this dcmtk build. All calling AE titles are accepted.',
        );
      }

      this.dcmtkProcess = spawn(storeScpCmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.dcmtkProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Received file')) {
          const match = output.match(/Received file: (.+\.dcm)/);
          if (match) {
            this.onFileReceived(match[1]).catch((err) =>
              this.logger.error(`Error processing received file: ${err.message}`),
            );
          }
        }
      });

      this.dcmtkProcess.stderr?.on('data', (data: Buffer) => {
        const err = data.toString().trim();
        if (err && !err.includes('I: ')) {
          this.logger.warn(`storescp: ${err}`);
        }
      });

      this.dcmtkProcess.on('exit', (code) => {
        this.isRunning = false;
        if (code !== 0 && code !== null) {
          this.logger.warn(`storescp exited with code ${code}, restarting in 5s...`);
          setTimeout(() => this.startListener(), 5000);
        }
      });

      this.isRunning = true;
      this.logger.log(`DICOM SCP listening on port ${this.port} as ${this.aeTitle}`);
    } catch {
      // dcmtk not available — fall back to TCP port monitoring only
      this.logger.warn(
        'dcmtk storescp not found. Using file-watcher mode. ' +
        'Install dcmtk for full DICOM protocol support.',
      );
      await this.startFallbackMode();
    }
  }

  /**
   * Fallback: watch the incoming directory for .dcm files.
   * Works with any external DICOM receiver tool.
   */
  private async startFallbackMode() {
    this.logger.log(`Watching for DICOM files in: ${this.storageDir}`);
    // The DicomFileWatcherService handles this via chokidar
    this.isRunning = true;
  }

  private stopListener() {
    if (this.dcmtkProcess) {
      this.dcmtkProcess.kill('SIGTERM');
      this.dcmtkProcess = undefined;
    }
    this.isRunning = false;
  }

  async onFileReceived(filePath: string): Promise<void> {
    try {
      this.logger.log(`Processing DICOM file: ${filePath}`);

      const metadata = await this.dicomParser.parseFile(filePath);
      const studyUid = metadata.studyInstanceUid;

      if (!studyUid) {
        this.logger.warn(`No StudyInstanceUID in file: ${filePath}`);
        return;
      }

      // Get or create study record
      let study = this.database.get(
        'SELECT * FROM studies WHERE study_instance_uid = ?',
        studyUid,
      ) as Record<string, unknown> | undefined;

      const fileId = uuidv4();
      const studyDir = path.join(this.storageDir, `study_${studyUid.replace(/\./g, '_')}`);
      await fs.ensureDir(studyDir);

      const targetPath = path.join(studyDir, path.basename(filePath));
      await fs.move(filePath, targetPath, { overwrite: false });

      const fileSize = (await fs.stat(targetPath)).size;

      if (!study) {
        const studyId = uuidv4();
        this.database.run(
          `INSERT INTO studies (id, study_instance_uid, patient_id, patient_name, study_date, modalities, storage_path, file_count, total_size, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          studyId,
          studyUid,
          metadata.patientId || null,
          metadata.patientName || null,
          metadata.studyDate || null,
          JSON.stringify(metadata.modality ? [metadata.modality] : []),
          studyDir,
          fileSize,
          JSON.stringify(metadata),
        );

        study = this.database.get('SELECT * FROM studies WHERE id = ?', studyId) as Record<string, unknown>;

        // Report to cloud API
        this.eventEmitter.emit('study.new', { studyId, metadata, studyDir });
      } else {
        this.database.run(
          'UPDATE studies SET file_count = file_count + 1, total_size = total_size + ?, updated_at = datetime("now") WHERE id = ?',
          fileSize,
          study.id,
        );
      }

      // Register DICOM file
      this.database.run(
        `INSERT OR IGNORE INTO dicom_files (id, study_id, series_uid, sop_uid, file_path, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        fileId,
        study!.id,
        metadata.seriesInstanceUid || 'unknown',
        metadata.sopInstanceUid || uuidv4(),
        targetPath,
        fileSize,
      );

      // Queue for export
      await this.queueService.enqueueFile({
        studyId: study!.id as string,
        filePath: targetPath,
        fileSize,
        metadata,
      });

      this.eventEmitter.emit('dicom.file_received', {
        studyId: study!.id,
        filePath: targetPath,
        metadata,
      });
    } catch (err) {
      this.logger.error(`Failed to process DICOM file ${filePath}: ${(err as Error).message}`);
      // Move to failed directory
      const failedDir = this.configService.get<string>('agent.failedDir', './storage/failed');
      await fs.ensureDir(failedDir).then(() =>
        fs.move(filePath, path.join(failedDir, path.basename(filePath)), { overwrite: true }),
      ).catch(() => null);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      aeTitle: this.aeTitle,
      port: this.port,
      storageDir: this.storageDir,
    };
  }
}
