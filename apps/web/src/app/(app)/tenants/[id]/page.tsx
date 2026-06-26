'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PaginatedResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, ArrowLeft, RefreshCw, Plus, Server,
  Users, Layers, CheckCircle, XCircle, Loader2, Pencil, Settings,
  MapPin, Mail, Save,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, timeAgo, formatDateTime } from '@/lib/utils';


// ─── Types ──────────────────────────────────────────────────

interface TenantDetail {
  id: string; name: string; slug: string;
  status: string; plan: string;
  billingEmail?: string; logoUrl?: string;
  settings: Record<string, unknown>;
  quotas: Record<string, unknown>;
  features: Record<string, boolean>;
  createdAt: string; updatedAt: string;
}

interface FlatClinic {
  id: string; name: string; status: string;
  cnpj?: string; cnes?: string; logoUrl?: string;
  addressCity?: string; addressState?: string;
  contactEmail?: string; contactPhone?: string;
  dicomAeTitle?: string;
  edgeAgentCount?: number; activeEdgeAgents?: number;
  createdAt: string;
  _count?: { edgeAgents: number; users: number; studies: number };
}

// ─── Utils ──────────────────────────────────────────────────

const planBadge: Record<string, string> = {
  FREE: 'text-muted-foreground bg-muted border-muted',
  STARTER: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  PROFESSIONAL: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  ENTERPRISE: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
};
const statusBadge: Record<string, string> = {
  ACTIVE: 'text-status-success bg-status-success/10 border-status-success/20',
  INACTIVE: 'text-muted-foreground bg-muted border-muted',
  SUSPENDED: 'text-status-error bg-status-error/10 border-status-error/20',
};

const inputClass = 'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Edit Tenant Modal ───────────────────────────────────────

const editTenantSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(255),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']),
  billingEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  // Quotas
  maxClinics: z.coerce.number().min(-1),
  maxUsers: z.coerce.number().min(-1),
  maxStorageGB: z.coerce.number().min(-1),
  maxEdgeAgents: z.coerce.number().min(-1),
  // Features
  mfa: z.boolean().default(false),
  auditLogs: z.boolean().default(true),
  webhooks: z.boolean().default(false),
  dicomAnonymization: z.boolean().default(false),
  bulkExport: z.boolean().default(false),
  worklistEnabled: z.boolean().default(false),
});

type EditTenantForm = z.infer<typeof editTenantSchema>;

const FEATURE_LABELS: Record<string, string> = {
  mfa: 'MFA (Autenticação 2 Fatores)',
  auditLogs: 'Logs de Auditoria',
  webhooks: 'Webhooks',
  dicomAnonymization: 'Anonimização DICOM',
  bulkExport: 'Exportação em Lote',
  worklistEnabled: 'Worklist DICOM',
};

const PLAN_PRESETS: Record<string, Partial<EditTenantForm>> = {
  FREE:         { maxClinics: 1,  maxUsers: 5,   maxStorageGB: 10,  maxEdgeAgents: 1, bulkExport: false },
  STARTER:      { maxClinics: 3,  maxUsers: 10,  maxStorageGB: 100, maxEdgeAgents: 5, bulkExport: false },
  PROFESSIONAL: { maxClinics: 10, maxUsers: 50,  maxStorageGB: 500, maxEdgeAgents: 20, bulkExport: true },
  ENTERPRISE:   { maxClinics: -1, maxUsers: -1,  maxStorageGB: -1,  maxEdgeAgents: -1, bulkExport: true },
};

function EditTenantModal({ tenant, onClose }: { tenant: TenantDetail | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<EditTenantForm>({
    resolver: zodResolver(editTenantSchema),
  });

  const watchPlan = watch('plan');

  useEffect(() => {
    if (tenant) {
      const q = tenant.quotas as Record<string, number>;
      const f = tenant.features as Record<string, boolean>;
      reset({
        name: tenant.name,
        plan: tenant.plan as EditTenantForm['plan'],
        status: tenant.status as EditTenantForm['status'],
        billingEmail: tenant.billingEmail ?? '',
        maxClinics: q.maxClinics ?? 3,
        maxUsers: q.maxUsers ?? 10,
        maxStorageGB: q.maxStorageGB ?? 100,
        maxEdgeAgents: q.maxEdgeAgents ?? 5,
        ...Object.fromEntries(Object.keys(FEATURE_LABELS).map((k) => [k, f[k] ?? false])),
      });
    }
  }, [tenant, reset]);

  const applyPreset = (plan: string) => {
    const preset = PLAN_PRESETS[plan];
    if (preset) Object.entries(preset).forEach(([k, v]) => setValue(k as any, v as any));
  };

  const mutation = useMutation({
    mutationFn: (data: EditTenantForm) => {
      const { maxClinics, maxUsers, maxStorageGB, maxEdgeAgents, mfa, auditLogs, webhooks,
        dicomAnonymization, bulkExport, worklistEnabled,
        ...rest } = data;
      return api.put(`/tenants/${tenant!.id}`, {
        ...rest,
        quotas: { ...tenant!.quotas, maxClinics, maxUsers, maxStorageGB, maxEdgeAgents },
        features: { mfa, auditLogs, webhooks, dicomAnonymization, bulkExport, worklistEnabled },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenant!.id] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });

  const inputCls = 'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all';

  return (
    <Dialog open={!!tenant} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={16} />
            Editar Tenant
          </DialogTitle>
          <DialogDescription>{tenant?.name}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-5 max-h-[65vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao atualizar tenant'}
              </div>
            )}

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nome *</label>
                <input {...register('name')} placeholder="Nome da empresa" className={inputCls} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email de cobrança</label>
                <input {...register('billingEmail')} type="email" placeholder="financeiro@empresa.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                <select {...register('status')} className={inputCls}>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="SUSPENDED">Suspenso</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </div>
            </div>

            {/* Plan */}
            <div className="border-t border-border pt-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">Plano</label>
              <div className="grid grid-cols-4 gap-2">
                {(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setValue('plan', p); applyPreset(p); }}
                    className={cn(
                      'py-2.5 px-3 rounded-lg border text-xs font-medium transition-all',
                      watchPlan === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input text-muted-foreground hover:text-foreground hover:border-primary/40',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Selecionar um plano aplica os limites padrão automaticamente. Você pode ajustar abaixo.
              </p>
            </div>

            {/* Quotas */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Limites e Cotas
                <span className="ml-2 font-normal normal-case text-muted-foreground/70">(-1 = ilimitado)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Máx. Clínicas', field: 'maxClinics' },
                  { label: 'Máx. Usuários', field: 'maxUsers' },
                  { label: 'Armazenamento (GB)', field: 'maxStorageGB' },
                  { label: 'Máx. Edge Agents', field: 'maxEdgeAgents' },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                    <input {...register(field as any)} type="number" min="-1" className={inputCls} />
                  </div>
                ))}
              </div>
            </div>

            {/* Features */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Funcionalidades
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const isEnabled = watch(key as any);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setValue(key as any, !isEnabled)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all',
                        isEnabled
                          ? 'bg-status-success/10 border-status-success/30 text-status-success'
                          : 'bg-background border-input text-muted-foreground hover:border-primary/30',
                      )}
                    >
                      {isEnabled ? <CheckCircle size={13} /> : <XCircle size={13} className="opacity-40" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Clinic Modal ─────────────────────────────────────

const clinicSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(255),
  addressCity: z.string().min(2, 'Cidade obrigatória'),
  addressState: z.string().length(2, 'UF com 2 letras').toUpperCase(),
  cnpj: z.string().optional().or(z.literal('')),
  cnes: z.string().optional().or(z.literal('')),
  addressStreet: z.string().optional().or(z.literal('')),
  addressNumber: z.string().optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  contactEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  contactResponsible: z.string().optional().or(z.literal('')),
  dicomAeTitle: z.string().max(16).optional().or(z.literal('')),
});

type ClinicForm = z.infer<typeof clinicSchema>;

function CreateClinicModal({
  tenantId, tenantName, open, onClose,
}: {
  tenantId: string; tenantName: string; open: boolean; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: ClinicForm) => {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined));
      // Super Admin creates clinic in a specific tenant context
      return api.post('/clinics', { ...clean, _tenantId: tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-clinics', tenantId] });
      reset();
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova Clínica</DialogTitle>
          <DialogDescription>Adicionando clínica ao tenant: <strong>{tenantName}</strong></DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao criar clínica'}
              </div>
            )}
            <Field label="Nome da Clínica *" error={errors.name?.message}>
              <input {...register('name')} placeholder="Clínica Centro de Imagem" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CNPJ"><input {...register('cnpj')} placeholder="00.000.000/0001-00" className={inputClass} /></Field>
              <Field label="CNES"><input {...register('cnes')} placeholder="0000000" className={inputClass} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Rua"><input {...register('addressStreet')} placeholder="Av. Paulista" className={inputClass} /></Field>
              </div>
              <Field label="Número"><input {...register('addressNumber')} placeholder="1000" className={inputClass} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade *" error={errors.addressCity?.message}>
                <input {...register('addressCity')} placeholder="São Paulo" className={inputClass} />
              </Field>
              <Field label="UF *" error={errors.addressState?.message}>
                <input {...register('addressState')} placeholder="SP" maxLength={2} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone"><input {...register('contactPhone')} placeholder="(11) 3000-0000" className={inputClass} /></Field>
              <Field label="Email"><input {...register('contactEmail')} type="email" placeholder="contato@clinica.com" className={inputClass} /></Field>
            </div>
            <Field label="Responsável"><input {...register('contactResponsible')} placeholder="Dr. João Silva" className={inputClass} /></Field>
            <Field label="AE Title DICOM">
              <input {...register('dicomAeTitle')} placeholder="SMARTPACS" maxLength={16} className={`${inputClass} font-mono uppercase`} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {mutation.isPending ? 'Criando...' : 'Criar Clínica'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { is } = usePermission();
  const [showCreateClinic, setShowCreateClinic] = useState(false);
  const [editTenant, setEditTenant] = useState(false);

  if (!is('SUPER_ADMIN')) {
    router.replace('/dashboard');
    return null;
  }

  const { data: tenantRes, isLoading: loadingTenant } = useQuery({
    queryKey: ['tenant-detail', id],
    queryFn: () => api.get<{ data: TenantDetail }>(`/tenants/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: clinicsRes, isLoading: loadingClinics, refetch } = useQuery({
    queryKey: ['tenant-clinics', id],
    queryFn: () =>
      api.get<{ data: PaginatedResponse<FlatClinic> }>(`/clinics?tenantId=${id}&limit=50`)
        .then((r) => r.data.data),
    enabled: !!id,
  });

  const tenant = tenantRes;
  const clinics = clinicsRes?.data || [];

  if (loadingTenant) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 skeleton rounded" />
        <div className="h-40 skeleton rounded-xl" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  if (!tenant) return (
    <div className="text-center py-12 text-muted-foreground">Tenant não encontrado.</div>
  );

  const quotas = tenant.quotas as Record<string, number>;
  const features = tenant.features as Record<string, boolean>;

  return (
    <div className="space-y-6">
      <CreateClinicModal
        tenantId={id}
        tenantName={tenant.name}
        open={showCreateClinic}
        onClose={() => setShowCreateClinic(false)}
      />
      <EditTenantModal
        tenant={editTenant ? tenant : null}
        onClose={() => setEditTenant(false)}
      />

      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/tenants')}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{tenant.name}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', planBadge[tenant.plan] || '')}>
              {tenant.plan}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', statusBadge[tenant.status] || '')}>
              {tenant.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Slug: <code className="bg-muted px-1 rounded text-xs">{tenant.slug}</code>
            {tenant.billingEmail && ` · ${tenant.billingEmail}`}
          </p>
        </div>
        <button
          onClick={() => setEditTenant(true)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Pencil size={14} />
          Editar Tenant
        </button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Clínicas', value: clinics.length, icon: Building2, note: `/ ${quotas.maxClinics === -1 ? '∞' : quotas.maxClinics} máx` },
          { label: 'Usuários', value: quotas.maxUsers === -1 ? '∞' : `—`, icon: Users, note: `máx ${quotas.maxUsers === -1 ? 'ilimitado' : quotas.maxUsers}` },
          { label: 'Armazenamento', value: `${quotas.usedStorageGB ?? 0} GB`, icon: Layers, note: `/ ${quotas.maxStorageGB === -1 ? '∞' : quotas.maxStorageGB} GB` },
          { label: 'Edge Agents', value: `—`, icon: Server, note: `máx ${quotas.maxEdgeAgents === -1 ? 'ilimitado' : quotas.maxEdgeAgents}` },
        ].map(({ label, value, icon: Icon, note }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon size={14} className="text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Settings size={14} /> Funcionalidades habilitadas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries({
            mfa: 'MFA',
            auditLogs: 'Auditoria',
            webhooks: 'Webhooks',
            dicomAnonymization: 'Anonimização',
            bulkExport: 'Export em Lote',
            worklistEnabled: 'Worklist',
          }).map(([key, label]) => (
            <div key={key} className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
              features[key]
                ? 'bg-status-success/5 border-status-success/20 text-status-success'
                : 'bg-muted/30 border-border text-muted-foreground',
            )}>
              {features[key]
                ? <CheckCircle size={12} />
                : <XCircle size={12} className="opacity-50" />}
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Clinics */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Building2 size={14} /> Clínicas do tenant
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {clinics.length} clínica{clinics.length !== 1 ? 's' : ''} registrada{clinics.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
              <RefreshCw size={13} className={loadingClinics ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowCreateClinic(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
              <Plus size={12} /> Nova Clínica
            </button>
          </div>
        </div>

        {loadingClinics ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-lg" />)}
          </div>
        ) : clinics.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground">
            <Building2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma clínica cadastrada neste tenant.</p>
            <button onClick={() => setShowCreateClinic(true)}
              className="mt-3 text-xs text-primary hover:underline">
              Criar a primeira clínica →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clinics.map((clinic) => {
              const city = clinic.addressCity ?? (clinic as any).address?.city;
              const state = clinic.addressState ?? (clinic as any).address?.state;
              const aeTitle = clinic.dicomAeTitle ?? (clinic as any).settings?.dicomAeTitle;
              const agentsCount = clinic._count?.edgeAgents ?? clinic.edgeAgentCount ?? 0;
              const usersCount = clinic._count?.users ?? 0;
              const studiesCount = clinic._count?.studies ?? 0;

              return (
                <div key={clinic.id}
                  onClick={() => router.push(`/clinics`)}
                  className="px-5 py-4 hover:bg-muted/20 transition-colors cursor-pointer">
                  <div className="flex items-start gap-4">
                    {clinic.logoUrl ? (
                      <img src={clinic.logoUrl} alt={clinic.name}
                        className="w-10 h-10 rounded-lg object-contain bg-muted border border-border flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 size={18} className="text-primary" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground text-sm">{clinic.name}</span>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full text-xs font-medium border',
                          clinic.status === 'ACTIVE'
                            ? 'text-status-success bg-status-success/10 border-status-success/20'
                            : 'text-muted-foreground bg-muted border-muted',
                        )}>
                          {clinic.status}
                        </span>
                        {aeTitle && (
                          <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-muted-foreground">
                            {aeTitle}
                          </code>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {city && (
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {city}, {state}
                          </span>
                        )}
                        {clinic.contactEmail && (
                          <span className="flex items-center gap-1">
                            <Mail size={10} /> {clinic.contactEmail}
                          </span>
                        )}
                        {clinic.cnpj && (
                          <span>{clinic.cnpj}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                      <div className="text-center">
                        <p className="font-semibold text-foreground text-sm">{agentsCount}</p>
                        <p>Agentes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-foreground text-sm">{usersCount}</p>
                        <p>Usuários</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-foreground text-sm">{studiesCount}</p>
                        <p>Estudos</p>
                      </div>
                      <div className="text-center text-xs text-muted-foreground/70">
                        {timeAgo(clinic.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="text-xs text-muted-foreground text-right">
        Criado: {formatDateTime(tenant.createdAt)} · Atualizado: {formatDateTime(tenant.updatedAt)}
      </div>
    </div>
  );
}
