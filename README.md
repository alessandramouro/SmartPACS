# SmartPACS

**Enterprise SaaS Platform for Medical Imaging Management**

SmartPACS is a multi-tenant SaaS platform for small and medium diagnostic imaging clinics. It receives DICOM images and videos from ultrasound equipment, organizes studies automatically, and synchronizes to Google Drive, Microsoft OneDrive, or NAS/SMB — with offline resilience.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SmartPACS Platform                          │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Next.js    │    │  NestJS API │    │   PostgreSQL +       │ │
│  │  Frontend   │◄──►│  Backend    │◄──►│   Redis             │ │
│  │  Port 3000  │    │  Port 3001  │    │                     │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
│                            │ REST / WebSocket                   │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
           ┌────────▼────────┐    ┌───▼──────────────────────┐
           │  Edge Agent     │    │  Cloud Storage           │
           │  (Clinic Local) │    │  • Google Drive          │
           │                 │    │  • Microsoft OneDrive    │
           │  • DICOM SCP    │    │  • NAS / SMB             │
           │  • File Watcher │    └──────────────────────────┘
           │  • SQLite Queue │
           │  • Sync Engine  │
           │  • Watchdog     │
           └─────────────────┘
                    ▲
                    │ DICOM C-STORE
                    │
           ┌────────┴────────┐
           │  Ultrasound /   │
           │  CT / MR        │
           │  Equipment      │
           └─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20, NestJS 10, TypeScript 5 |
| **Database** | PostgreSQL 16, Prisma ORM |
| **Queue** | Redis 7, BullMQ |
| **Frontend** | Next.js 15, React 19, TypeScript |
| **UI** | TailwindCSS 3, ShadCN UI, Radix UI |
| **State** | Zustand, TanStack Query |
| **Edge Agent** | NestJS, SQLite (better-sqlite3) |
| **DICOM** | dcmtk (storescp/dcmdump) |
| **Storage** | Google Drive API v3, Microsoft Graph API |
| **Auth** | JWT (RS256), Argon2id, TOTP MFA |
| **Observability** | OpenTelemetry, Prometheus, Grafana |
| **DevOps** | Docker, GitHub Actions, Turborepo |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Git

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/smartpacs.git
cd smartpacs
cp .env.example .env
# Edit .env with your values (minimum: JWT secrets + encryption keys)
```

### 2. Start Infrastructure

```bash
docker compose up -d postgres redis mailhog
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Setup Database

```bash
cd apps/api
npx prisma migrate dev --name init
npm run db:seed
```

### 5. Start Development Servers

```bash
# All services (from root)
npm run dev

# Or individually
npm run dev --filter=@smartpacs/api
npm run dev --filter=@smartpacs/web
npm run dev --filter=@smartpacs/edge-agent
```

### 6. Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Docs (Swagger) | http://localhost:3001/docs |
| Health Check | http://localhost:3001/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3003 (admin/smartpacs) |
| MailHog | http://localhost:8025 |
| pgAdmin | http://localhost:5050 |

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@smartpacs.com | Admin@123456! |
| Demo Clinic Admin | admin@clinicademo.com | Demo@123456! |

---

## Project Structure

```
SmartPACS/
├── apps/
│   ├── api/                   # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/      # JWT + RBAC + MFA
│   │   │   │   ├── tenant/    # Multi-tenancy
│   │   │   │   ├── clinic/    # Clinic management
│   │   │   │   ├── user/      # User management
│   │   │   │   ├── study/     # DICOM studies
│   │   │   │   ├── export/    # Export jobs
│   │   │   │   ├── edge-agent/# Agent management
│   │   │   │   ├── storage/   # OAuth flows
│   │   │   │   ├── audit/     # Audit logs (LGPD)
│   │   │   │   ├── webhook/   # Webhooks
│   │   │   │   ├── health/    # Health checks
│   │   │   │   └── metrics/   # Prometheus
│   │   │   ├── common/        # Guards, filters, utils
│   │   │   ├── config/        # Configuration
│   │   │   └── prisma/        # Database service
│   │   └── prisma/
│   │       ├── schema.prisma  # Full DB schema
│   │       └── seed.ts        # Seed data
│   │
│   ├── web/                   # Next.js Frontend
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/    # Login, forgot password
│   │       │   └── (app)/     # Protected pages
│   │       │       ├── dashboard/
│   │       │       ├── studies/
│   │       │       ├── clinics/
│   │       │       ├── users/
│   │       │       ├── agents/
│   │       │       └── audit/
│   │       ├── components/
│   │       ├── stores/        # Zustand state
│   │       └── lib/           # API client, utils
│   │
│   └── edge-agent/            # Local clinic agent
│       └── src/
│           ├── modules/
│           │   ├── dicom-listener/  # DICOM SCP + file watcher
│           │   ├── sync-engine/     # Upload connectors
│           │   │   └── connectors/
│           │   │       ├── google-drive.connector.ts
│           │   │       ├── onedrive.connector.ts
│           │   │       └── smb.connector.ts
│           │   ├── queue/           # SQLite queue
│           │   ├── watchdog/        # System monitoring
│           │   ├── cloud-api/       # API client
│           │   └── state/           # Agent state
│           └── database/            # SQLite service
│
├── packages/
│   ├── types/                 # Shared TypeScript types
│   └── eslint-config/         # Shared ESLint rules
│
├── infrastructure/
│   └── docker/
│       ├── nginx/             # Reverse proxy config
│       ├── prometheus/        # Metrics config
│       ├── grafana/           # Dashboards
│       └── postgres/          # DB initialization
│
├── .github/workflows/ci.yml   # GitHub Actions CI/CD
├── docker-compose.yml         # Development
├── docker-compose.prod.yml    # Production
└── turbo.json                 # Monorepo pipeline
```

---

## Security

SmartPACS is designed for LGPD (Brazil) and HIPAA readiness:

- **Encryption**: AES-256-GCM for sensitive storage configs
- **Passwords**: Argon2id with high memory cost
- **Tokens**: JWT with short access (15min) + long refresh (7d) rotation
- **RBAC**: Role-based + permission-based access control
- **Audit**: Full audit log trail (all CRUD + auth events)
- **MFA**: TOTP-based 2FA (otplib)
- **Rate Limiting**: Per-endpoint limits via Throttler
- **Headers**: Helmet for HTTP security headers
- **Validation**: Global ValidationPipe with whitelist
- **Soft Delete**: No hard deletes on patient data

---

## Environment Variables

See [.env.example](.env.example) for all available variables.

Minimum required for development:
- `DATABASE_URL`
- `JWT_SECRET` (min 32 chars)
- `JWT_REFRESH_SECRET` (min 32 chars)
- `ENCRYPTION_KEY` (exactly 32 chars)
- `ENCRYPTION_IV` (exactly 16 chars)

---

## API Reference

Swagger UI available at `/docs` in non-production environments.

Key endpoints:
- `POST /api/v1/auth/login` — Authentication
- `GET /api/v1/studies` — List studies with filters
- `GET /api/v1/studies/stats` — Dashboard statistics
- `GET /api/v1/agents` — Edge agent status
- `POST /api/v1/agents` — Register new edge agent
- `POST /api/v1/agents/:id/heartbeat` — Agent heartbeat [API Key]

---

## Edge Agent Setup

```bash
# 1. Register agent via API or admin panel to get API key
# 2. Create .env for edge agent
cat > apps/edge-agent/.env << EOF
EDGE_AGENT_ID=<agent-id-from-registration>
EDGE_AGENT_API_KEY=<api-key-from-registration>
EDGE_AGENT_CLINIC_ID=<clinic-id>
CLOUD_API_URL=https://your-smartpacs-instance.com
DICOM_AE_TITLE=YOURAEITLE
DICOM_SCP_PORT=104
STORAGE_PATH=C:\SmartPACS\storage   # Windows
EOF

# 3. Start agent
npm run dev --filter=@smartpacs/edge-agent
```

---

## Production Deployment

```bash
# 1. Configure .env.production
cp .env.example .env.production
# Edit with production values

# 2. Build and start
docker compose -f docker-compose.prod.yml up -d

# 3. Run migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 4. Seed initial data
docker compose -f docker-compose.prod.yml exec api npm run db:seed
```

---

## License

Proprietary — SmartPACS © 2025. All rights reserved.
