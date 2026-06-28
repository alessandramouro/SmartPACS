import type { UUID, ISODateString, PaginationParams, DateRangeFilter } from './common';
import type { DicomMetadata, DicomModality } from './dicom';

export type StudyStatus =
  | 'RECEIVING'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'QUEUED_EXPORT'
  | 'EXPORTING'
  | 'EXPORTED'
  | 'EXPORT_FAILED'
  | 'ARCHIVED';

export interface Study {
  id: UUID;
  tenantId: UUID;
  clinicId: UUID;
  edgeAgentId?: UUID;
  patientId?: string;
  patientName?: string;
  patientBirthDate?: string;
  studyInstanceUid: string;
  accessionNumber?: string;
  studyDate?: ISODateString;
  studyDescription?: string;
  modalities: DicomModality[];
  status: StudyStatus;
  fileCount: number;
  totalSizeBytes: number;
  storagePath: string;
  metadata?: Partial<DicomMetadata>;
  exportedAt?: ISODateString;
  exportDestinations?: ExportDestinationSummary[];
  orthancStudyId?: string;
  orthancStoredAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ExportDestinationSummary {
  destinationId: UUID;
  destinationName: string;
  type: StorageDestinationType;
  status: ExportStatus;
  exportedAt?: ISODateString;
}

export type ExportStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED';

export type StorageDestinationType =
  | 'GOOGLE_DRIVE'
  | 'ONEDRIVE'
  | 'SMB'
  | 'NFS'
  | 'S3'
  | 'LOCAL';

export interface StudyFilter extends PaginationParams, DateRangeFilter {
  q?: string;
  status?: StudyStatus | StudyStatus[];
  modality?: DicomModality | DicomModality[];
  clinicId?: UUID;
  patientId?: string;
  patientName?: string;
  accessionNumber?: string;
}

export interface StudyStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  byStatus: Record<StudyStatus, number>;
  byModality: Record<DicomModality, number>;
  totalSizeBytes: number;
  averageSizeBytes: number;
  exportSuccessRate: number;
}
