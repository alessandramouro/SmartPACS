'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PaginatedResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building, Search, Plus, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, Users, Layers,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';


interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  billingEmail?: string;
  createdAt: string;
  _count?: { clinics: number; users: number };
}

const planColors: Record<string, string> = {
  FREE: 'text-muted-foreground bg-muted border-muted',
  STARTER: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  PROFESSIONAL: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  ENTERPRISE: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'text-status-success bg-status-success/10 border-status-success/20',
  INACTIVE: 'text-muted-foreground bg-muted border-muted',
  SUSPENDED: 'text-status-error bg-status-error/10 border-status-error/20',
  PENDING: 'text-status-warning bg-status-warning/10 border-status-warning/20',
};

const inputClass = 'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all';

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

const createSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(255),
  slug: z.string().min(2, 'Slug obrigatório').max(100)
    .regex(/^[a-z0-9-]+$/, 'Somente letras minúsculas, números e hífens'),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  billingEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  adminName: z.string().min(2, 'Nome do admin obrigatório'),
  adminEmail: z.string().email('Email do admin inválido'),
  adminPassword: z.string().min(8, 'Senha mínimo 8 caracteres'),
});

type CreateForm = z.infer<typeof createSchema>;

function CreateTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { plan: 'STARTER' },
  });

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    setValue('slug', slug);
  };

  const mutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/tenants', {
      name: data.name,
      slug: data.slug,
      plan: data.plan,
      ...(data.billingEmail && { billingEmail: data.billingEmail }),
      adminName: data.adminName,
      adminEmail: data.adminEmail,
      adminPassword: data.adminPassword,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); reset(); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo Tenant (Empresa)</DialogTitle>
          <DialogDescription>
            Cria uma nova empresa cliente na plataforma SmartPACS com seu Admin inicial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao criar tenant'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome da empresa *" error={errors.name?.message}>
                <input
                  {...register('name')}
                  onChange={(e) => { register('name').onChange(e); handleNameChange(e); }}
                  placeholder="Clínica Exemplo Ltda"
                  className={inputClass}
                />
              </Field>
              <Field label="Slug (identificador único) *" error={errors.slug?.message} hint="Usado nas URLs. Ex: clinica-exemplo">
                <input {...register('slug')} placeholder="clinica-exemplo" className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Plano *" error={errors.plan?.message}>
                <select {...register('plan')} className={inputClass}>
                  <option value="FREE">Free</option>
                  <option value="STARTER">Starter</option>
                  <option value="PROFESSIONAL">Professional</option>
                  <option value="ENTERPRISE">Enterprise</option>
                </select>
              </Field>
              <Field label="Email de cobrança" error={errors.billingEmail?.message}>
                <input {...register('billingEmail')} type="email" placeholder="financeiro@empresa.com" className={inputClass} />
              </Field>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Admin Tenant inicial
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome do admin *" error={errors.adminName?.message}>
                  <input {...register('adminName')} placeholder="João Silva" className={inputClass} />
                </Field>
                <Field label="Email do admin *" error={errors.adminEmail?.message}>
                  <input {...register('adminEmail')} type="email" placeholder="admin@empresa.com" className={inputClass} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Senha inicial *" error={errors.adminPassword?.message} hint="Mínimo 8 caracteres — o admin poderá alterar no primeiro acesso">
                  <input {...register('adminPassword')} type="password" placeholder="••••••••" className={inputClass} autoComplete="new-password" />
                </Field>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {mutation.isPending ? 'Criando...' : 'Criar Tenant'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TenantsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { is } = usePermission();
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tenants', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      return api.get<{ data: PaginatedResponse<Tenant> }>(`/tenants?${params}`).then((r) => r.data.data);
    },
    placeholderData: (prev) => prev,
  });

  if (!is('SUPER_ADMIN')) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
        <Building size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">Acesso restrito</p>
        <p className="text-xs mt-1">Somente Super Admin pode gerenciar tenants.</p>
      </div>
    );
  }

  const tenants = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Nome, slug..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={() => refetch()}
          className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors ml-auto">
          <Plus size={14} />
          Novo Tenant
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Clínicas / Usuários</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Criado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <Building size={32} className="mx-auto mb-2 opacity-30" />
                    Nenhum tenant encontrado
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id}
                    onClick={() => router.push(`/tenants/${tenant.id}`)}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building size={14} className="text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{tenant.name}</p>
                          {tenant.billingEmail && (
                            <p className="text-xs text-muted-foreground">{tenant.billingEmail}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{tenant.slug}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        planColors[tenant.plan] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        statusColors[tenant.status] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Layers size={11} />
                          {(tenant as any)._count?.clinics ?? '—'} clínicas
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          {(tenant as any)._count?.users ?? '—'} usuários
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(tenant.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Página {meta.page} de {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.hasPreviousPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={!meta.hasNextPage}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
