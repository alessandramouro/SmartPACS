import * as argon2 from 'argon2';

import { prisma } from './db';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 };

export async function createTenant(
  overrides: Partial<{ name: string; slug: string; features: Record<string, boolean> }> = {},
) {
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? 'E2E Test Tenant',
      slug: overrides.slug ?? `e2e-tenant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...(overrides.features && { features: overrides.features }),
    },
  });
}

export async function createClinic(
  tenantId: string,
  overrides: Partial<{
    name: string;
    worklistEnabled: boolean;
    worklistHisUrl: string;
    worklistAeTitle: string;
  }> = {},
) {
  return prisma.clinic.create({
    data: {
      tenantId,
      name: overrides.name ?? 'E2E Test Clinic',
      addressCity: 'São Paulo',
      addressState: 'SP',
      ...(overrides.worklistEnabled !== undefined && { worklistEnabled: overrides.worklistEnabled }),
      ...(overrides.worklistHisUrl !== undefined && { worklistHisUrl: overrides.worklistHisUrl }),
      ...(overrides.worklistAeTitle !== undefined && { worklistAeTitle: overrides.worklistAeTitle }),
    },
  });
}

// Mirrors UserService.defaultPermissions() — a raw prisma.user.create() (unlike the
// real create flow) doesn't populate this, so e2e fixtures have to do it themselves
// or every permission-gated endpoint 403s regardless of role.
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'tenants:read', 'tenants:write', 'tenants:delete',
    'clinics:read', 'clinics:write', 'clinics:delete',
    'users:read', 'users:write', 'users:delete',
    'studies:read', 'studies:write', 'studies:delete', 'studies:export',
    'exports:read', 'exports:manage',
    'storage:read', 'storage:configure',
    'audit:read', 'system:admin',
  ],
  TENANT_ADMIN: [
    'clinics:read', 'clinics:write', 'clinics:delete',
    'users:read', 'users:write', 'users:delete',
    'studies:read', 'studies:write', 'studies:delete', 'studies:export',
    'exports:read', 'exports:manage',
    'storage:read', 'storage:configure',
    'audit:read',
  ],
  CLINIC_ADMIN: [
    'clinics:read', 'clinics:write',
    'users:read', 'users:write',
    'studies:read', 'studies:write', 'studies:export',
    'exports:read', 'exports:manage',
    'storage:read', 'storage:configure',
  ],
  READONLY: ['studies:read', 'exports:read', 'storage:read'],
};

export async function createUser(
  tenantId: string,
  clinicId: string | null,
  overrides: Partial<{ email: string; password: string; role: string; permissions: string[] }> = {},
) {
  const password = overrides.password ?? 'E2ETest@12345!';
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const role = overrides.role ?? 'SUPER_ADMIN';

  const user = await prisma.user.create({
    data: {
      tenantId,
      clinicId,
      email: overrides.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      name: 'E2E Test User',
      passwordHash,
      role: role as any,
      status: 'ACTIVE',
      emailVerified: true,
      permissions: overrides.permissions ?? DEFAULT_PERMISSIONS[role] ?? [],
    },
  });

  return { user, password };
}

export async function createEdgeAgent(
  tenantId: string,
  clinicId: string,
  overrides: Partial<{ apiKey: string }> = {},
) {
  const apiKey = overrides.apiKey ?? `e2e-agent-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const apiKeyHash = await argon2.hash(apiKey, ARGON2_OPTIONS);

  const agent = await prisma.edgeAgent.create({
    data: {
      tenantId,
      clinicId,
      name: 'E2E Test Agent',
      version: '1.0.0',
      apiKey,
      apiKeyHash,
      dicomAeTitle: 'SMARTPACS',
      dicomPort: 11112,
    },
  });

  return { agent, apiKey };
}

export async function createStorageDestination(
  tenantId: string,
  clinicId: string,
  type: 'GOOGLE_DRIVE' | 'ONEDRIVE' | 'SMB' | 'NFS' | 'S3' | 'LOCAL' = 'LOCAL',
) {
  return prisma.storageDestination.create({
    data: { tenantId, clinicId, name: `E2E ${type} destination`, type: type as any },
  });
}
