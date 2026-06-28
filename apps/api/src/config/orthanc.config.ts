import { registerAs } from '@nestjs/config';

export default registerAs('orthanc', () => ({
  url: process.env.ORTHANC_URL || 'http://orthanc:8042',
  apiUser: process.env.ORTHANC_API_USER || 'smartpacs-api',
  apiPassword: process.env.ORTHANC_API_PASSWORD || '',
  viewerUrl: process.env.OHIF_VIEWER_URL || 'http://localhost:8043',
  viewerTokenTtl: process.env.VIEWER_TOKEN_TTL || '5m',
}));
