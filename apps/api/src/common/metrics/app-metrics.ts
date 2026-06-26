import * as client from 'prom-client';

export const httpRequestDuration = new client.Histogram({
  name: 'smartpacs_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
});

export const studiesIngestedTotal = new client.Counter({
  name: 'smartpacs_studies_ingested_total',
  help: 'Total DICOM studies received from edge agents',
  labelNames: ['modality'],
});

export const exportJobsTotal = new client.Counter({
  name: 'smartpacs_export_jobs_total',
  help: 'Total export jobs by terminal status and destination type',
  labelNames: ['status', 'destination_type'],
});

export const edgeAgentsConnected = new client.Gauge({
  name: 'smartpacs_edge_agents_connected',
  help: 'Number of edge agents currently connected via WebSocket',
});
