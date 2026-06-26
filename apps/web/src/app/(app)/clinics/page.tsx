'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Clinic, PaginatedResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Search, Plus, RefreshCw, Server, ChevronLeft, ChevronRight, Loader2, Pencil, Upload, X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, statusColors, timeAgo } from '@/lib/utils';

const clinicSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(255),
  addressCity: z.string().min(2, 'Cidade obrigatória').max(100),
  addressState: z.string().length(2, 'UF deve ter 2 letras').toUpperCase(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  logoUrl: z.string().optional().or(z.literal('')),
  cnpj: z.string().optional().or(z.literal('')),
  cnes: z.string().optional().or(z.literal('')),
  addressStreet: z.string().optional().or(z.literal('')),
  addressNumber: z.string().optional().or(z.literal('')),
  addressZipCode: z.string().optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  contactEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  contactResponsible: z.string().optional().or(z.literal('')),
  dicomAeTitle: z.string().max(16).optional().or(z.literal('')),
  worklistEnabled: z.boolean().optional(),
  worklistHisUrl: z.string().optional().or(z.literal('')),
  worklistAeTitle: z.string().max(16).optional().or(z.literal('')),
  anonymizeOnExport: z.boolean().optional(),
});

type ClinicForm = z.infer<typeof clinicSchema>;

// Helper: the API returns flat Prisma fields, not the nested Clinic TS type
type FlatClinic = Clinic & {
  logoUrl?: string;
  addressCity?: string; addressState?: string; addressStreet?: string;
  addressNumber?: string; addressZipCode?: string; contactPhone?: string;
  contactEmail?: string; contactResponsible?: string; dicomAeTitle?: string;
  status?: string;
  worklistEnabled?: boolean; worklistHisUrl?: string; worklistAeTitle?: string;
  anonymizeOnExport?: boolean;
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

function LogoUpload({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(value || '');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { api } = await import('@/lib/api');
      const res = await api.post<{ data: { url: string } }>('/uploads/image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data.data.url;
      setPreview(url);
      onChange(url);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao fazer upload da imagem');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-xl border border-input bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
        {preview
          ? <img src={preview} alt="Logo" className="w-full h-full object-contain p-1" />
          : <Building2 size={24} className="text-muted-foreground/40" />}
      </div>
      <div className="flex-1">
        <label className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors w-fit',
          uploading && 'opacity-50 cursor-not-allowed',
        )}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Enviando...' : 'Escolher imagem'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG até 2MB</p>
        {preview && (
          <button type="button" onClick={() => { setPreview(''); onChange(''); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive mt-1 transition-colors">
            <X size={11} /> Remover logo
          </button>
        )}
      </div>
    </div>
  );
}

function ClinicFormFields({ register, errors, showStatus = false, setValue, watch }: {
  register: any; errors: any; showStatus?: boolean; setValue?: any; watch?: any;
}) {
  const logoUrl = watch?.('logoUrl') || '';
  return (
    <>
      {/* Logo */}
      {setValue && (
        <div className="border-b border-border pb-4 mb-1">
          <label className="block text-xs font-medium text-muted-foreground mb-2">Logotipo da Clínica</label>
          <LogoUpload value={logoUrl} onChange={(url) => setValue('logoUrl', url)} />
          <input type="hidden" {...register('logoUrl')} />
        </div>
      )}

      <Field label="Nome da Clínica *" error={errors.name?.message}>
        <input {...register('name')} placeholder="Ex: Clínica Centro de Imagem" className={inputClass} />
      </Field>
      {showStatus && (
        <Field label="Status" error={errors.status?.message}>
          <select {...register('status')} className={inputClass}>
            <option value="ACTIVE">Ativa</option>
            <option value="INACTIVE">Inativa</option>
            <option value="SUSPENDED">Suspensa</option>
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="CNPJ" error={errors.cnpj?.message}>
          <input {...register('cnpj')} placeholder="00.000.000/0001-00" className={inputClass} />
        </Field>
        <Field label="CNES" error={errors.cnes?.message}>
          <input {...register('cnes')} placeholder="0000000" className={inputClass} />
        </Field>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Endereço</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Rua" error={errors.addressStreet?.message}>
            <input {...register('addressStreet')} placeholder="Av. Paulista" className={inputClass} />
          </Field>
          <Field label="Número" error={errors.addressNumber?.message}>
            <input {...register('addressNumber')} placeholder="1000" className={inputClass} />
          </Field>
          <Field label="CEP" error={errors.addressZipCode?.message}>
            <input {...register('addressZipCode')} placeholder="00000-000" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Cidade *" error={errors.addressCity?.message}>
            <input {...register('addressCity')} placeholder="São Paulo" className={inputClass} />
          </Field>
          <Field label="UF *" error={errors.addressState?.message}>
            <input {...register('addressState')} placeholder="SP" maxLength={2} className={inputClass} />
          </Field>
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contato</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone" error={errors.contactPhone?.message}>
            <input {...register('contactPhone')} placeholder="(11) 3000-0000" className={inputClass} />
          </Field>
          <Field label="Email" error={errors.contactEmail?.message}>
            <input {...register('contactEmail')} type="email" placeholder="contato@clinica.com" className={inputClass} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Responsável" error={errors.contactResponsible?.message}>
            <input {...register('contactResponsible')} placeholder="Dr. João Silva" className={inputClass} />
          </Field>
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">DICOM</p>
        <Field label="AE Title (máx. 16 chars)" error={errors.dicomAeTitle?.message}>
          <input {...register('dicomAeTitle')} placeholder="SMARTPACS" maxLength={16}
            className={`${inputClass} font-mono uppercase`} />
        </Field>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Worklist (HIS/RIS)</p>
        <label className="flex items-center gap-2 mb-3 text-sm text-foreground">
          <input type="checkbox" {...register('worklistEnabled')} className="accent-primary" />
          Habilitar Worklist DICOM (C-FIND)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="HIS/RIS (host:port)" error={errors.worklistHisUrl?.message}>
            <input {...register('worklistHisUrl')} placeholder="192.168.1.10:104" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="AE Title do HIS/RIS" error={errors.worklistAeTitle?.message}>
            <input {...register('worklistAeTitle')} placeholder="HIS_SCP" maxLength={16}
              className={`${inputClass} font-mono uppercase`} />
          </Field>
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Privacidade (LGPD)</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" {...register('anonymizeOnExport')} className="accent-primary" />
          Anonimizar estudos automaticamente antes de exportar
        </label>
      </div>
    </>
  );
}

function CreateClinicModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: ClinicForm) =>
      api.post('/clinics', Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clinics'] }); reset(); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova Clínica</DialogTitle>
          <DialogDescription>Preencha os dados para cadastrar uma nova clínica.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao criar clínica'}
              </div>
            )}
            <ClinicFormFields register={register} errors={errors} setValue={setValue} watch={watch} />
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

function EditClinicModal({ clinic, onClose }: { clinic: Clinic | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
  });

  useEffect(() => {
    if (clinic) {
      const c = clinic as FlatClinic;
      reset({
        name: c.name ?? '',
        status: (c.status?.toUpperCase() as ClinicForm['status']) || 'ACTIVE',
        logoUrl: c.logoUrl ?? '',
        cnpj: c.cnpj ?? '',
        cnes: c.cnes ?? '',
        addressCity: c.addressCity ?? c.address?.city ?? '',
        addressState: c.addressState ?? c.address?.state ?? '',
        addressStreet: c.addressStreet ?? c.address?.street ?? '',
        addressNumber: c.addressNumber ?? c.address?.number ?? '',
        addressZipCode: c.addressZipCode ?? c.address?.zipCode ?? '',
        contactPhone: c.contactPhone ?? c.contact?.phone ?? '',
        contactEmail: c.contactEmail ?? c.contact?.email ?? '',
        contactResponsible: c.contactResponsible ?? c.contact?.responsibleName ?? '',
        dicomAeTitle: c.dicomAeTitle ?? c.settings?.dicomAeTitle ?? '',
        worklistEnabled: c.worklistEnabled ?? c.settings?.worklistEnabled ?? false,
        worklistHisUrl: c.worklistHisUrl ?? c.settings?.worklistHisUrl ?? '',
        worklistAeTitle: c.worklistAeTitle ?? c.settings?.worklistAeTitle ?? '',
        anonymizeOnExport: c.anonymizeOnExport ?? c.settings?.anonymizeOnExport ?? false,
      });
    }
  }, [clinic, reset]);

  const mutation = useMutation({
    mutationFn: (data: ClinicForm) => {
      // Filter out empty strings so they don't overwrite existing values
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '' && v !== undefined),
      );
      return api.put(`/clinics/${clinic!.id}`, payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clinics'] }); onClose(); },
  });

  return (
    <Dialog open={!!clinic} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Clínica</DialogTitle>
          <DialogDescription>{clinic?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao atualizar clínica'}
              </div>
            )}
            <ClinicFormFields register={register} errors={errors} showStatus setValue={setValue} watch={watch} />
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {mutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClinicsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editClinic, setEditClinic] = useState<FlatClinic | null>(null);
  const { can } = usePermission();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clinics', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: page.toString(), limit: '20', ...(search && { q: search }) });
      return api.get<{ data: PaginatedResponse<FlatClinic> }>(`/clinics?${params}`).then((r) => r.data.data);
    },
    placeholderData: (prev) => prev,
  });

  const clinics = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <CreateClinicModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditClinicModal clinic={editClinic as Clinic | null} onClose={() => setEditClinic(null)} />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Nome, CNPJ, cidade..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={() => refetch()}
          className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
        {can('clinics:write') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors ml-auto">
            <Plus size={14} /> Nova Clínica
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Clínica</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">CNPJ / CNES</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Agentes</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">AE Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Criada</th>
                {can('clinics:write') && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : clinics.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                    Nenhuma clínica encontrada
                  </td>
                </tr>
              ) : (
                clinics.map((clinic) => (
                  <tr key={clinic.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {clinic.logoUrl ? (
                          <img
                            src={clinic.logoUrl}
                            alt={clinic.name}
                            className="w-8 h-8 rounded-lg object-contain bg-muted flex-shrink-0 border border-border"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} className="text-primary" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{clinic.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {clinic.contactEmail ?? clinic.contact?.email ?? ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>{clinic.cnpj || '—'}</p>
                      {clinic.cnes && <p className="text-muted-foreground/60">CNES {clinic.cnes}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {(clinic.addressCity ?? clinic.address?.city)
                        ? `${clinic.addressCity ?? clinic.address?.city}, ${clinic.addressState ?? clinic.address?.state}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs">
                        <Server size={12} className="text-muted-foreground" />
                        <span className="text-foreground font-medium">{clinic.activeEdgeAgents ?? 0}</span>
                        <span className="text-muted-foreground">/ {clinic.edgeAgentCount ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {clinic.dicomAeTitle ?? clinic.settings?.dicomAeTitle ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        statusColors[String(clinic.status).toUpperCase()] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {clinic.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(clinic.createdAt)}</td>
                    {can('clinics:write') && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditClinic(clinic)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar clínica"
                        >
                          <Pencil size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Página {meta.page} de {meta.totalPages} ({meta.total.toLocaleString('pt-BR')} total)
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
