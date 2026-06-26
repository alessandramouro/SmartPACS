import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { DicomMetadata } from '@smartpacs/types';
import * as fs from 'fs-extra';

/**
 * DicomParserService — extracts metadata from DICOM files.
 *
 * Production-grade approach: run dcmtk's dcmdump as a subprocess
 * to parse DICOM tags, avoiding a full Node.js DICOM parser.
 * Falls back to reading raw binary for basic tag extraction.
 */
@Injectable()
export class DicomParserService {
  private readonly logger = new Logger(DicomParserService.name);

  async parseFile(filePath: string): Promise<Partial<DicomMetadata> & { hash: string }> {
    try {
      const hash = await this.computeHash(filePath);

      // Try dcmtk first
      const metadata = await this.parseDcmdump(filePath);
      return { ...metadata, hash };
    } catch {
      // Fallback to binary parsing
      const metadata = await this.parseBinary(filePath);
      const hash = await this.computeHash(filePath);
      return { ...metadata, hash };
    }
  }

  private async parseDcmdump(filePath: string): Promise<Partial<DicomMetadata>> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync('dcmdump', ['+P', 'StudyInstanceUID', '+P', 'PatientID', '+P', 'PatientName', '+P', 'StudyDate', '+P', 'Modality', '+P', 'SeriesInstanceUID', '+P', 'SOPInstanceUID', '+P', 'AccessionNumber', filePath]);

    return this.parseDcmdumpOutput(stdout);
  }

  private parseDcmdumpOutput(output: string): Partial<DicomMetadata> {
    const extractValue = (tag: string): string | undefined => {
      const regex = new RegExp(`${tag}.*\\[(.+?)\\]`);
      const match = output.match(regex);
      return match?.[1]?.trim();
    };

    return {
      studyInstanceUid: extractValue('0020,000D') || '',
      patientId: extractValue('0010,0020'),
      patientName: extractValue('0010,0010')?.replace(/\^/g, ' ')?.trim(),
      studyDate: extractValue('0008,0020'),
      modality: extractValue('0008,0060') as any,
      seriesInstanceUid: extractValue('0020,000E'),
      sopInstanceUid: extractValue('0008,0018'),
      accessionNumber: extractValue('0008,0050'),
    };
  }

  /**
   * Binary DICOM parser — reads known tag offsets.
   * Handles common cases without dcmtk dependency.
   */
  private async parseBinary(filePath: string): Promise<Partial<DicomMetadata>> {
    const buffer = await fs.readFile(filePath);

    // Verify DICOM magic bytes at offset 128: "DICM"
    if (buffer.length < 132 || buffer.toString('ascii', 128, 132) !== 'DICM') {
      throw new Error('Not a valid DICOM file');
    }

    const tags: Record<string, string> = {};
    let offset = 132; // Skip preamble + magic

    while (offset + 8 < buffer.length) {
      const group = buffer.readUInt16LE(offset);
      const element = buffer.readUInt16LE(offset + 2);
      const tagKey = `${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')}`;

      offset += 4;
      const vr = buffer.toString('ascii', offset, offset + 2);
      offset += 2;

      let length: number;
      if (['OB', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT'].includes(vr)) {
        offset += 2; // reserved
        length = buffer.readUInt32LE(offset);
        offset += 4;
      } else {
        length = buffer.readUInt16LE(offset);
        offset += 2;
      }

      if (length > 0 && length < 1024 && length !== 0xffffffff) {
        const value = buffer.toString('ascii', offset, offset + length).trim().replace(/\0/g, '');
        if (value) tags[tagKey] = value;
      }

      offset += length === 0xffffffff ? 0 : length;
      if (offset > buffer.length) break;
    }

    return {
      studyInstanceUid: tags['0020,000d'] || tags['0020,000D'] || '',
      patientId: tags['0010,0020'],
      patientName: tags['0010,0010']?.replace(/\^/g, ' ')?.trim(),
      studyDate: tags['0008,0020'],
      modality: tags['0008,0060'] as any,
      seriesInstanceUid: tags['0020,000e'] || tags['0020,000E'],
      sopInstanceUid: tags['0008,0018'],
      accessionNumber: tags['0008,0050'],
      institutionName: tags['0008,0080'],
      stationName: tags['0008,1010'],
      manufacturer: tags['0008,0070'],
      manufacturerModelName: tags['0008,1090'],
    };
  }

  private async computeHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk as Buffer));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
