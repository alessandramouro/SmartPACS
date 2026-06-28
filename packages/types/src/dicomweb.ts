import type { UUID } from './common';

export interface OrthancForwardResult {
  orthancStudyId: string;
  stowSopInstanceCount: number;
}

export interface ViewerTokenResponse {
  token: string;
  studyInstanceUid: string;
  expiresAt: string;
  viewerUrl: string;
}

export interface ViewerTokenPayload {
  sub: string; // studyInstanceUid
  tenantId: UUID;
  type: 'viewer';
}
