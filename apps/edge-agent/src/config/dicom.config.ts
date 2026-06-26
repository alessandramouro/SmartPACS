import { registerAs } from '@nestjs/config';

export default registerAs('dicom', () => ({
  aeTitle: process.env.DICOM_AE_TITLE || 'SMARTPACS',
  port: parseInt(process.env.DICOM_SCP_PORT || '104', 10),
  allowedCallingAeTitles: (process.env.DICOM_ALLOWED_AE_TITLES || '').split(',').filter(Boolean),
  maxAssociations: parseInt(process.env.DICOM_MAX_ASSOCIATIONS || '10', 10),
  receiveTimeout: parseInt(process.env.DICOM_RECEIVE_TIMEOUT || '30000', 10),
  storageDirectory: process.env.DICOM_RECEIVED_DIR || './storage/received',
  worklist: {
    enabled: process.env.DICOM_WORKLIST_ENABLED === 'true',
    hisUrl: process.env.DICOM_WORKLIST_HIS_URL || '', // host:port of the HIS/RIS C-FIND SCP
    hisAeTitle: process.env.DICOM_WORKLIST_HIS_AE_TITLE || 'ANY-SCP',
    localPort: parseInt(process.env.DICOM_WORKLIST_LOCAL_PORT || '105', 10),
    dir: process.env.DICOM_WORKLIST_DIR || './storage/worklist',
    cacheMinutes: parseInt(process.env.DICOM_WORKLIST_CACHE_MINUTES || '5', 10),
  },
}));
