import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OrthancProxyResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

@Injectable()
export class OrthancClientService {
  private readonly logger = new Logger(OrthancClientService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('orthanc.url')!;
    const user = this.configService.get<string>('orthanc.apiUser')!;
    const password = this.configService.get<string>('orthanc.apiPassword')!;
    this.authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  /** Generic pass-through to Orthanc's DICOMweb plugin, used by the QIDO/WADO proxy. */
  async forwardDicomweb(
    path: string,
    search: string,
    accept?: string,
  ): Promise<OrthancProxyResponse> {
    const url = `${this.baseUrl}/dicom-web/${path}${search}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        ...(accept ? { Accept: accept } : {}),
      },
    });

    return { status: res.status, headers: res.headers, body: res.body };
  }

  /** Relays a STOW-RS multipart body from an edge agent into the central archive. */
  async stowStudy(body: Buffer, contentType: string): Promise<{ sopInstanceCount: number }> {
    const res = await fetch(`${this.baseUrl}/dicom-web/studies`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': contentType,
        Accept: 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`STOW-RS to Orthanc failed: ${res.status} ${text}`);
      throw new Error(`Orthanc STOW-RS failed with status ${res.status}`);
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const referencedSeq = json['00081199'] as { Value?: unknown[] } | undefined;
    return { sopInstanceCount: referencedSeq?.Value?.length ?? 0 };
  }

  /** Resolves Orthanc's internal study ID for a given StudyInstanceUID. */
  async lookupStudyId(studyInstanceUid: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/tools/lookup`, {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'text/plain' },
      body: studyInstanceUid,
    });
    if (!res.ok) return null;

    const results = (await res.json().catch(() => [])) as Array<{ Type: string; ID: string }>;
    return results.find((r) => r.Type === 'Study')?.ID ?? null;
  }
}
