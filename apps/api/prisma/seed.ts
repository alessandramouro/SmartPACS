import { PrismaClient, UserRole, TenantPlan, TenantStatus, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SmartPACS database...');

  // ─── Super Tenant (Platform) ────────────────────────────────
  const superTenant = await prisma.tenant.upsert({
    where: { slug: 'platform' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'SmartPACS Platform',
      slug: 'platform',
      status: TenantStatus.ACTIVE,
      plan: TenantPlan.ENTERPRISE,
      settings: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        dateFormat: 'DD/MM/YYYY',
        autoExportEnabled: false,
      },
      quotas: {
        maxClinics: -1,
        maxUsers: -1,
        maxStorageGB: -1,
        maxEdgeAgents: -1,
        usedStorageGB: 0,
        studiesThisMonth: 0,
      },
      features: {
        mfa: true,
        auditLogs: true,
        webhooks: true,
        dicomAnonymization: true,
        bulkExport: true,
        worklistEnabled: true,
      },
    },
  });
  console.log('✅ Super tenant created:', superTenant.slug);

  // ─── Super Admin User ────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@smartpacs.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456!';
  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const superAdmin = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: superTenant.id,
        email: adminEmail,
      },
    },
    update: { passwordHash },
    create: {
      tenantId: superTenant.id,
      email: adminEmail,
      name: 'Super Admin',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      permissions: [
        'tenants:read', 'tenants:write', 'tenants:delete',
        'clinics:read', 'clinics:write', 'clinics:delete',
        'users:read', 'users:write', 'users:delete',
        'studies:read', 'studies:write', 'studies:delete', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read', 'storage:configure',
        'audit:read', 'system:admin',
      ],
      preferences: {
        theme: 'dark',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        notifications: {
          emailOnExportComplete: true,
          emailOnExportFailed: true,
          emailOnEdgeAgentOffline: true,
          emailOnStorageFull: true,
          browserNotifications: true,
        },
      },
    },
  });
  console.log('✅ Super admin created:', superAdmin.email);

  // ─── Demo Tenant ────────────────────────────────────────────
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'clinica-demo' },
    update: {},
    create: {
      name: 'Clínica Demo',
      slug: 'clinica-demo',
      status: TenantStatus.ACTIVE,
      plan: TenantPlan.PROFESSIONAL,
      billingEmail: 'financeiro@clinicademo.com',
      settings: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        dateFormat: 'DD/MM/YYYY',
        autoExportEnabled: true,
        defaultStorageType: 'GOOGLE_DRIVE',
        retentionDays: 365,
      },
      quotas: {
        maxClinics: 5,
        maxUsers: 20,
        maxStorageGB: 500,
        maxEdgeAgents: 10,
        usedStorageGB: 12.5,
        studiesThisMonth: 47,
      },
      features: {
        mfa: true,
        auditLogs: true,
        webhooks: true,
        dicomAnonymization: false,
        bulkExport: true,
        worklistEnabled: true,
      },
    },
  });
  console.log('✅ Demo tenant created:', demoTenant.slug);

  // ─── Demo Clinic ─────────────────────────────────────────────
  const demoClinic = await prisma.clinic.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: demoTenant.id,
      name: 'Clínica Centro de Imagem',
      cnpj: '12.345.678/0001-90',
      cnes: '1234567',
      addressCity: 'São Paulo',
      addressState: 'SP',
      addressCountry: 'BR',
      addressStreet: 'Av. Paulista',
      addressNumber: '1000',
      addressZipCode: '01310-100',
      contactPhone: '(11) 3000-0000',
      contactEmail: 'contato@centroimagem.com',
      contactResponsible: 'Dr. João Silva',
      dicomAeTitle: 'CENTROIMAGEM',
      dicomPort: 104,
      timezone: 'America/Sao_Paulo',
      autoExportEnabled: true,
      exportOnComplete: true,
      worklistEnabled: true,
    },
  });
  console.log('✅ Demo clinic created:', demoClinic.name);

  // ─── Demo Users ──────────────────────────────────────────────
  const demoAdminHash = await argon2.hash('Demo@123456!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const demoAdmin = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: demoTenant.id,
        email: 'admin@clinicademo.com',
      },
    },
    update: {},
    create: {
      tenantId: demoTenant.id,
      clinicId: demoClinic.id,
      email: 'admin@clinicademo.com',
      name: 'Admin Demo',
      passwordHash: demoAdminHash,
      role: UserRole.CLINIC_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      permissions: [
        'clinics:read', 'clinics:write',
        'users:read', 'users:write',
        'studies:read', 'studies:write', 'studies:export',
        'exports:read', 'exports:manage',
        'storage:read', 'storage:configure',
        'audit:read',
      ],
      preferences: {
        theme: 'dark',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        notifications: {
          emailOnExportComplete: true,
          emailOnExportFailed: true,
          emailOnEdgeAgentOffline: true,
          emailOnStorageFull: true,
          browserNotifications: true,
        },
      },
    },
  });
  console.log('✅ Demo admin created:', demoAdmin.email);

  // ─── Demo Edge Agent ─────────────────────────────────────────
  const agentApiKey = `agt_${uuidv4().replace(/-/g, '')}`;
  const agentApiKeyHash = await argon2.hash(agentApiKey);

  const demoAgent = await prisma.edgeAgent.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      tenantId: demoTenant.id,
      clinicId: demoClinic.id,
      name: 'Agente Sala US-01',
      version: '1.0.0',
      status: 'OFFLINE',
      apiKey: agentApiKey,
      apiKeyHash: agentApiKeyHash,
      hostname: 'WORKSTATION-US01',
      platform: 'win32',
      osVersion: 'Windows 10 Enterprise',
      dicomAeTitle: 'AGENTE_US01',
      dicomPort: 104,
      dicomConfig: {
        allowedCallingAeTitles: ['ULTRASOUND_GE', 'ULTRASOUND_PHILIPS'],
        receiveDirectory: 'C:\\SmartPACS\\received',
        processedDirectory: 'C:\\SmartPACS\\processed',
        failedDirectory: 'C:\\SmartPACS\\failed',
      },
      remoteConfig: {
        syncIntervalSeconds: 30,
        heartbeatIntervalSeconds: 15,
        maxConcurrentUploads: 3,
        chunkSizeMB: 8,
        retryAttempts: 5,
        retryDelaySeconds: 60,
      },
    },
  });
  console.log('✅ Demo edge agent created:', demoAgent.name);
  console.log('   API Key (save this):', agentApiKey);

  // ─── Demo Storage Destination ────────────────────────────────
  const demoStorage = await prisma.storageDestination.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      tenantId: demoTenant.id,
      clinicId: demoClinic.id,
      name: 'Google Drive Principal',
      type: 'GOOGLE_DRIVE',
      isDefault: true,
      isActive: false, // Needs OAuth
      config: {
        type: 'GOOGLE_DRIVE',
        folderPath: '/SmartPACS/CentroImagem',
      },
    },
  });
  console.log('✅ Demo storage destination created:', demoStorage.name);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log('   Super Admin:', adminEmail, '/', adminPassword);
  console.log('   Demo Admin:  admin@clinicademo.com / Demo@123456!');
  console.log('   Web URL:     http://localhost:3000');
  console.log('   API URL:     http://localhost:3001');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
