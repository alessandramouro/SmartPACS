import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  name: process.env.APP_NAME || 'SmartPACS',
  port: parseInt(process.env.PORT || '3001', 10),
  url: process.env.APP_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  edgeAgentUrl: process.env.EDGE_AGENT_URL || 'http://localhost:3002',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  encryptionIv: process.env.ENCRYPTION_IV || '',
}));
