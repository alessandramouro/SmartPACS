import * as path from 'path';

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';

/**
 * Supervises dcmtk's wlmscpfs — a real, spec-compliant DICOM Basic Worklist
 * Management SCP. Per dcmtk's wlmsetup.txt, -dfp points at a root directory
 * containing one subdirectory per *called* AE title (each with a "lockfile"),
 * and only ".wl" files inside that subdirectory are served. Same spawn/on-exit/
 * restart-after-5s supervision pattern as DicomListenerService.
 */
@Injectable()
export class WorklistScpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorklistScpService.name);
  private readonly worklistDir: string;
  private readonly port: number;
  private process?: ReturnType<typeof import('child_process').spawn>;
  private stopped = false;

  constructor(private readonly configService: ConfigService) {
    this.worklistDir = path.resolve(this.configService.get<string>('dicom.worklist.dir', './storage/worklist'));
    this.port = this.configService.get<number>('dicom.worklist.localPort', 105);
  }

  async onModuleInit() {
    if (!this.configService.get<boolean>('dicom.worklist.enabled', false)) return;

    const aeTitle = this.configService.get<string>('dicom.aeTitle', 'SMARTPACS');
    const aeDir = path.join(this.worklistDir, aeTitle);
    await fs.ensureDir(aeDir);
    await fs.ensureFile(path.join(aeDir, 'lockfile'));

    await this.start();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.process?.kill();
  }

  private async start() {
    try {
      const { spawn } = await import('child_process');
      const cmd = process.platform === 'win32' ? 'wlmscpfs.exe' : 'wlmscpfs';
      const args = ['-dfp', this.worklistDir, this.port.toString()];

      this.process = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg && !msg.startsWith('I: ')) this.logger.warn(`wlmscpfs: ${msg}`);
      });

      this.process.on('exit', (code) => {
        if (this.stopped) return;
        if (code !== 0 && code !== null) {
          this.logger.warn(`wlmscpfs exited with code ${code}, restarting in 5s...`);
          setTimeout(() => this.start(), 5000);
        }
      });

      this.logger.log(`Worklist SCP listening on port ${this.port}, serving ${this.worklistDir}`);
    } catch (err) {
      this.logger.warn(`wlmscpfs not available: ${(err as Error).message}`);
    }
  }
}
