'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PaginatedResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive, Cloud, Network, Server, RefreshCw, CheckCircle,
  Clock, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2,
  Link2, Link2Off, AlertCircle, Settings2, Save, Eye, EyeOff,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';

interface OAuthToken {
  id: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  accountEmail: string;
  expiresAt?: string;
  clinicId?: string;
  destinationId?: string;
  createdAt: string;
}

// ─── Types ──────────────────────────────────────────────────

interface StorageDest {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  createdAt: string;
}

interface FlatClinic {
  id: string;
  name: string;
  addressCity?: string;
  addressState?: string;
  address?: { city: string; state: string };
  storageDestinations?: StorageDest[];
}

// ─── Config ──────────────────────────────────────────────────

const typeIcons: Record<string, React.ElementType> = {
  GOOGLE_DRIVE: Cloud, ONEDRIVE: Cloud, SMB: Network,
  NFS: Server, S3: Cloud, LOCAL: HardDrive,
};

const typeLabels: Record<string, string> = {
  GOOGLE_DRIVE: 'Google Drive', ONEDRIVE: 'OneDrive',
  SMB: 'SMB / Windows Share', NFS: 'NFS', S3: 'Amazon S3', LOCAL: 'Local',
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

// ─── Storage Modal ────────────────────────────────────────────

const storageSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(255),
  type: z.enum(['GOOGLE_DRIVE', 'ONEDRIVE', 'SMB', 'NFS', 'S3', 'LOCAL']),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  // SMB
  smbHost: z.string().optional().or(z.literal('')),
  smbShare: z.string().optional().or(z.literal('')),
  smbPath: z.string().optional().or(z.literal('')),
  smbUsername: z.string().optional().or(z.literal('')),
  smbPassword: z.string().optional().or(z.literal('')),
  smbDomain: z.string().optional().or(z.literal('')),
  // NFS
  nfsHost: z.string().optional().or(z.literal('')),
  nfsExportPath: z.string().optional().or(z.literal('')),
  nfsMountOptions: z.string().optional().or(z.literal('')),
  // S3
  s3Bucket: z.string().optional().or(z.literal('')),
  s3Region: z.string().optional().or(z.literal('')),
  s3Prefix: z.string().optional().or(z.literal('')),
  s3AccessKeyId: z.string().optional().or(z.literal('')),
  s3SecretAccessKey: z.string().optional().or(z.literal('')),
  s3Endpoint: z.string().optional().or(z.literal('')),
  // LOCAL
  localPath: z.string().optional().or(z.literal('')),
  // Google Drive / OneDrive
  folderPath: z.string().optional().or(z.literal('')),
});

type StorageForm = z.infer<typeof storageSchema>;

function buildConfig(data: StorageForm): Record<string, unknown> {
  switch (data.type) {
    case 'SMB': return {
      type: 'SMB', host: data.smbHost, share: data.smbShare,
      path: data.smbPath, username: data.smbUsername,
      password: data.smbPassword, domain: data.smbDomain,
    };
    case 'NFS': return {
      type: 'NFS', host: data.nfsHost, exportPath: data.nfsExportPath,
      mountOptions: data.nfsMountOptions,
    };
    case 'S3': return {
      type: 'S3', bucket: data.s3Bucket, region: data.s3Region,
      prefix: data.s3Prefix, accessKeyId: data.s3AccessKeyId,
      secretAccessKey: data.s3SecretAccessKey, endpoint: data.s3Endpoint,
    };
    case 'LOCAL': return { type: 'LOCAL', path: data.localPath };
    case 'GOOGLE_DRIVE': return { type: 'GOOGLE_DRIVE', folderPath: data.folderPath };
    case 'ONEDRIVE': return { type: 'ONEDRIVE', folderPath: data.folderPath };
    default: return { type: data.type };
  }
}

// ─── Credentials Modal ───────────────────────────────────────

interface EnvCredentials {
  GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string;
  MICROSOFT_CLIENT_ID: string; MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT_ID: string; MICROSOFT_REDIRECT_URI: string;
  configured: { google: boolean; microsoft: boolean };
}

function CredentialsModal({
  provider, onClose,
}: {
  provider: 'GOOGLE' | 'MICROSOFT' | null;
  onClose: () => void;
}) {
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<Record<string, string>>();
  const [showSecrets, setShowSecrets] = useState(false);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();

  const inputCls = 'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono';

  const { data: creds, isLoading } = useQuery({
    queryKey: ['env-credentials'],
    queryFn: () => api.get<{ data: EnvCredentials }>('/settings/oauth-credentials').then((r) => r.data.data),
    enabled: !!provider,
  });

  useEffect(() => {
    if (creds && provider) {
      if (provider === 'GOOGLE') {
        reset({
          GOOGLE_CLIENT_ID: creds.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: creds.GOOGLE_CLIENT_SECRET,
          GOOGLE_REDIRECT_URI: creds.GOOGLE_REDIRECT_URI,
        });
      } else {
        reset({
          MICROSOFT_CLIENT_ID: creds.MICROSOFT_CLIENT_ID,
          MICROSOFT_CLIENT_SECRET: creds.MICROSOFT_CLIENT_SECRET,
          MICROSOFT_TENANT_ID: creds.MICROSOFT_TENANT_ID,
          MICROSOFT_REDIRECT_URI: creds.MICROSOFT_REDIRECT_URI,
        });
      }
    }
  }, [creds, provider, reset]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v && !v.includes('*')));
      return api.patch('/settings/oauth-credentials', clean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env-credentials'] });
      setSaved(true);
      setTimeout(() => { setSaved(false); reset(undefined, { keepValues: true }); }, 3000);
    },
  });

  const isGoogle = provider === 'GOOGLE';
  const providerLabel = isGoogle ? 'Google Drive' : 'Microsoft OneDrive';
  const providerColor = isGoogle ? 'text-blue-400' : 'text-blue-500';
  const configured = isGoogle ? creds?.configured.google : creds?.configured.microsoft;

  return (
    <Dialog open={!!provider} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud size={16} className={providerColor} />
            Credenciais OAuth — {providerLabel}
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais para habilitar a autorização {providerLabel}.
            {' '}Valores com **** já estão salvos e não serão sobrescritos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-3">
            {isLoading ? (
              <div className="h-32 skeleton rounded-lg" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded border',
                    configured
                      ? 'bg-status-success/10 text-status-success border-status-success/20'
                      : 'bg-status-warning/10 text-status-warning border-status-warning/20',
                  )}>
                    {configured ? '✓ Configurado' : '⚠ Não configurado — preencha abaixo'}
                  </span>
                  <button type="button" onClick={() => setShowSecrets(!showSecrets)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {showSecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showSecrets ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>

                {mutation.isError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">
                    {(mutation.error as any)?.response?.data?.message || 'Erro ao salvar credenciais'}
                  </div>
                )}
                {saved && (
                  <div className="p-3 bg-status-success/10 border border-status-success/20 rounded-lg text-status-success text-xs flex items-center gap-2">
                    <CheckCircle size={13} /> Credenciais salvas com sucesso!
                  </div>
                )}

                {isGoogle ? (
                  <>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">GOOGLE_CLIENT_ID</label>
                      <input {...register('GOOGLE_CLIENT_ID')} type={showSecrets ? 'text' : 'password'}
                        placeholder="xxxxx.apps.googleusercontent.com" className={inputCls} autoComplete="off" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">GOOGLE_CLIENT_SECRET</label>
                      <input {...register('GOOGLE_CLIENT_SECRET')} type={showSecrets ? 'text' : 'password'}
                        placeholder="GOCSPX-..." className={inputCls} autoComplete="off" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">GOOGLE_REDIRECT_URI</label>
                      <input {...register('GOOGLE_REDIRECT_URI')} type="text" className={inputCls} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">MICROSOFT_CLIENT_ID</label>
                      <input {...register('MICROSOFT_CLIENT_ID')} type={showSecrets ? 'text' : 'password'}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls} autoComplete="off" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">MICROSOFT_CLIENT_SECRET</label>
                      <input {...register('MICROSOFT_CLIENT_SECRET')} type={showSecrets ? 'text' : 'password'}
                        placeholder="xxxx~xxxx..." className={inputCls} autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">MICROSOFT_TENANT_ID</label>
                        <input {...register('MICROSOFT_TENANT_ID')} type="text" placeholder="common" className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">MICROSOFT_REDIRECT_URI</label>
                        <input {...register('MICROSOFT_REDIRECT_URI')} type="text" className={inputCls} />
                      </div>
                    </div>
                  </>
                )}

                <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Como obter as credenciais:</p>
                  {isGoogle ? (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Acesse <strong>console.cloud.google.com</strong> → Credenciais → OAuth 2.0</li>
                      <li>Tipo: <strong>Aplicativo Web</strong></li>
                      <li>URI autorizada: <code className="bg-muted px-1 rounded">…/api/v1/oauth/google/callback</code></li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Acesse <strong>portal.azure.com</strong> → Azure AD → App Registrations</li>
                      <li>Adicione URI: <code className="bg-muted px-1 rounded">…/api/v1/oauth/microsoft/callback</code></li>
                      <li>Crie um segredo em <strong>Certificates & secrets</strong></li>
                    </ol>
                  )}
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Fechar
            </button>
            <button type="submit" disabled={mutation.isPending || !isDirty || saved}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {mutation.isPending ? 'Salvando...' : 'Salvar no .env'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Storage Config Fields ────────────────────────────────────

function StorageConfigFields({ watch, register }: { watch: (k: string) => any; register: any }) {
  const type = watch('type');
  if (type === 'SMB') return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração SMB</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Host / IP *"><input {...register('smbHost')} placeholder="192.168.1.100" className={inputClass} /></Field>
        <Field label="Share (pasta compartilhada) *"><input {...register('smbShare')} placeholder="SmartPACS" className={inputClass} /></Field>
        <Field label="Caminho interno"><input {...register('smbPath')} placeholder="/estudos" className={inputClass} /></Field>
        <Field label="Domínio"><input {...register('smbDomain')} placeholder="WORKGROUP" className={inputClass} /></Field>
        <Field label="Usuário"><input {...register('smbUsername')} placeholder="usuario" className={inputClass} /></Field>
        <Field label="Senha"><input {...register('smbPassword')} type="password" placeholder="••••••" className={inputClass} /></Field>
      </div>
    </div>
  );
  if (type === 'NFS') return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração NFS</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Host / IP *"><input {...register('nfsHost')} placeholder="192.168.1.100" className={inputClass} /></Field>
        <Field label="Caminho de exportação *"><input {...register('nfsExportPath')} placeholder="/exports/dicom" className={inputClass} /></Field>
      </div>
      <Field label="Opções de montagem" hint="Ex: rw,sync,no_subtree_check"><input {...register('nfsMountOptions')} placeholder="rw,sync" className={inputClass} /></Field>
    </div>
  );
  if (type === 'S3') return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração S3</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bucket *"><input {...register('s3Bucket')} placeholder="meu-bucket-dicom" className={inputClass} /></Field>
        <Field label="Região *"><input {...register('s3Region')} placeholder="us-east-1" className={inputClass} /></Field>
        <Field label="Prefixo (pasta)"><input {...register('s3Prefix')} placeholder="dicom/clinica/" className={inputClass} /></Field>
        <Field label="Endpoint personalizado" hint="Deixe vazio para AWS"><input {...register('s3Endpoint')} placeholder="https://s3.minhastorage.com" className={inputClass} /></Field>
        <Field label="Access Key ID"><input {...register('s3AccessKeyId')} placeholder="AKIAXXXXXXXX" className={inputClass} /></Field>
        <Field label="Secret Access Key"><input {...register('s3SecretAccessKey')} type="password" placeholder="••••••••" className={inputClass} /></Field>
      </div>
    </div>
  );
  if (type === 'LOCAL') return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração Local</p>
      <Field label="Caminho da pasta *" hint="Caminho absoluto no servidor">
        <input {...register('localPath')} placeholder="C:\SmartPACS\Storage" className={inputClass} />
      </Field>
    </div>
  );
  if (type === 'GOOGLE_DRIVE' || type === 'ONEDRIVE') return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração {typeLabels[type]}</p>
      <Field label="Caminho da pasta" hint="Caminho na nuvem onde os estudos serão salvos">
        <input {...register('folderPath')} placeholder="/SmartPACS/Estudos" className={inputClass} />
      </Field>
    </div>
  );
  return null;
}

function StorageModal({
  clinicId, clinicName, dest, onClose,
}: {
  clinicId: string;
  clinicName: string;
  dest: StorageDest | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!dest;
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<StorageForm>({
    resolver: zodResolver(storageSchema),
    defaultValues: { type: 'GOOGLE_DRIVE', isDefault: false, isActive: true },
  });

  useEffect(() => {
    if (dest) {
      reset({
        name: dest.name,
        type: dest.type as StorageForm['type'],
        isDefault: dest.isDefault,
        isActive: dest.isActive,
      });
    } else {
      reset({ type: 'GOOGLE_DRIVE', isDefault: false, isActive: true });
    }
  }, [dest, reset]);

  const mutation = useMutation({
    mutationFn: (data: StorageForm) => {
      const payload: Record<string, unknown> = {
        ...(isEdit && { id: dest!.id }),
        name: data.name,
        type: data.type,
        isDefault: data.isDefault,
        isActive: data.isActive,
        config: buildConfig(data),
      };
      return api.post(`/clinics/${clinicId}/storage`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinics-storage'] });
      onClose();
    },
  });

  const watchIsDefault = watch('isDefault');
  const watchIsActive = watch('isActive');
  const watchType = watch('type') as string;
  const isCloudType = ['GOOGLE_DRIVE', 'ONEDRIVE'].includes(watchType);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [credentialsProvider, setCredentialsProvider] = useState<'GOOGLE' | 'MICROSOFT' | null>(null);

  // Load OAuth tokens for this clinic
  const { data: oauthTokens = [], refetch: refetchTokens } = useQuery({
    queryKey: ['oauth-tokens', clinicId],
    queryFn: () => api.get<{ data: OAuthToken[] }>(`/oauth/tokens?clinicId=${clinicId}`).then((r) => r.data.data),
    enabled: isCloudType,
  });

  const providerKey = watchType === 'GOOGLE_DRIVE' ? 'GOOGLE' : 'MICROSOFT';
  const connectedToken = oauthTokens.find((t) => t.provider === providerKey);

  const handleConnectOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const endpoint = watchType === 'GOOGLE_DRIVE' ? '/oauth/google/authorize' : '/oauth/microsoft/authorize';
      const destParam = dest?.id ? `&destinationId=${dest.id}` : '';
      const res = await api.get<{ data: { url: string } }>(`${endpoint}?clinicId=${clinicId}${destParam}`);
      window.location.href = res.data.data.url;
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao iniciar autorização OAuth');
      setConnectingOAuth(false);
    }
  };

  const revokeOAuth = useMutation({
    mutationFn: (tokenId: string) => api.delete(`/oauth/tokens/${tokenId}`),
    onSuccess: () => refetchTokens(),
  });

  return (
    <>
    <CredentialsModal
      provider={credentialsProvider}
      onClose={() => setCredentialsProvider(null)}
    />
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Destino' : 'Novo Destino de Armazenamento'}</DialogTitle>
          <DialogDescription>{clinicName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao salvar destino'}
              </div>
            )}
            <Field label="Nome *" error={errors.name?.message}>
              <input {...register('name')} placeholder="Google Drive Principal" className={inputClass} />
            </Field>
            <Field label="Tipo de armazenamento *" error={errors.type?.message}>
              <select {...register('type')} className={inputClass}>
                {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>

            <StorageConfigFields watch={watch as any} register={register} />

            {/* OAuth Connection — directly after config, before toggles */}
            {isCloudType && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Cloud size={12} />
                    Autorização {watchType === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCredentialsProvider(watchType === 'GOOGLE_DRIVE' ? 'GOOGLE' : 'MICROSOFT')}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-input rounded-lg px-2.5 py-1.5 hover:bg-muted"
                    title={`Configurar credenciais ${watchType === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive'}`}
                  >
                    <Settings2 size={12} />
                    Configurar {watchType === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive'}
                  </button>
                </div>

                {connectedToken ? (
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border',
                    connectedToken.expiresAt && new Date(connectedToken.expiresAt) < new Date()
                      ? 'bg-status-warning/5 border-status-warning/20'
                      : 'bg-status-success/5 border-status-success/20',
                  )}>
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      connectedToken.expiresAt && new Date(connectedToken.expiresAt) < new Date()
                        ? 'bg-status-warning' : 'bg-status-success',
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{connectedToken.accountEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        {connectedToken.expiresAt && new Date(connectedToken.expiresAt) < new Date()
                          ? '⚠ Token expirado — clique em Renovar'
                          : '✓ Conta autorizada'}
                        {' · '}Conectado {timeAgo(connectedToken.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleConnectOAuth}
                        disabled={connectingOAuth}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-primary/10 text-primary rounded border border-primary/20 hover:bg-primary/20 transition-colors"
                      >
                        {connectingOAuth ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        Renovar
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeOAuth.mutate(connectedToken.id)}
                        disabled={revokeOAuth.isPending}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Desconectar"
                      >
                        <Link2Off size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-status-warning/5 border border-status-warning/20 rounded-lg">
                    <AlertCircle size={14} className="text-status-warning flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-status-warning font-medium">Autorização necessária</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Esta clínica precisa autorizar o acesso ao {watchType === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive'} para que o destino funcione.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectOAuth}
                      disabled={connectingOAuth}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      {connectingOAuth
                        ? <><Loader2 size={12} className="animate-spin" />Conectando...</>
                        : <><Link2 size={12} />Autorizar</>}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Toggles — after OAuth section */}
            <div className="flex gap-4 border-t border-border pt-4">
              <button type="button"
                onClick={() => setValue('isDefault', !watchIsDefault)}
                className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors flex-1',
                  watchIsDefault ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-input text-muted-foreground hover:text-foreground')}>
                {watchIsDefault ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                Destino padrão
              </button>
              <button type="button"
                onClick={() => setValue('isActive', !watchIsActive)}
                className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors flex-1',
                  watchIsActive ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-background border-input text-muted-foreground hover:text-foreground')}>
                {watchIsActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {watchIsActive ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Destino'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Delete Confirm ──────────────────────────────────────────

function DeleteConfirmModal({
  dest, clinicId, onClose,
}: {
  dest: StorageDest | null;
  clinicId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.delete(`/clinics/${clinicId}/storage/${dest!.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clinics-storage'] }); onClose(); },
  });
  return (
    <Dialog open={!!dest} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir destino?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O destino <strong>{dest?.name}</strong> será removido permanentemente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toggle Active ───────────────────────────────────────────

function useToggleActive(clinicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dest, active }: { dest: StorageDest; active: boolean }) =>
      api.post(`/clinics/${clinicId}/storage`, {
        id: dest.id, name: dest.name, type: dest.type,
        isDefault: dest.isDefault, isActive: active,
        config: { type: dest.type },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinics-storage'] }),
  });
}

// ─── Page ────────────────────────────────────────────────────

export default function StoragePage() {
  const { can, is } = usePermission();
  const searchParams = useSearchParams();
  const [modal, setModal] = useState<{ clinicId: string; clinicName: string; dest: StorageDest | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ dest: StorageDest; clinicId: string } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const oauthProvider = searchParams.get('oauth');
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (oauthProvider) {
      const label = oauthProvider === 'google' ? 'Google Drive' : 'OneDrive';
      if (success) {
        setNotification({ type: 'success', message: `${label} autorizado com sucesso!` });
        queryClient.invalidateQueries({ queryKey: ['clinics-storage'] });
        queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
      } else if (error) {
        setNotification({ type: 'error', message: decodeURIComponent(error) });
      }
      window.history.replaceState({}, '', '/storage');
    }
  }, [searchParams, queryClient]);

  const { data: clinicsData, isLoading, refetch } = useQuery({
    queryKey: ['clinics-storage'],
    queryFn: () =>
      api.get<{ data: PaginatedResponse<FlatClinic> }>('/clinics?limit=50').then((r) => r.data.data),
  });

  const clinics = clinicsData?.data || [];

  return (
    <div className="space-y-6">
      {notification && (
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-xl border text-sm',
          notification.type === 'success'
            ? 'bg-status-success/10 border-status-success/20 text-status-success'
            : 'bg-destructive/10 border-destructive/20 text-destructive',
        )}>
          {notification.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {modal && (
        <StorageModal
          clinicId={modal.clinicId}
          clinicName={modal.clinicName}
          dest={modal.dest}
          onClose={() => setModal(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          dest={deleteTarget.dest}
          clinicId={deleteTarget.clinicId}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Destinos de armazenamento para exportação automática de estudos DICOM
        </p>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground text-sm transition-colors">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}</div>
      ) : clinics.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          <HardDrive size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma clínica encontrada</p>
        </div>
      ) : (
        clinics.map((clinic) => (
          <ClinicStorageCard
            key={clinic.id}
            clinic={clinic}
            canConfigure={can('storage:configure')}
            isSuperAdmin={is('SUPER_ADMIN')}
            onAdd={() => setModal({ clinicId: clinic.id, clinicName: clinic.name, dest: null })}
            onEdit={(dest) => setModal({ clinicId: clinic.id, clinicName: clinic.name, dest })}
            onDelete={(dest) => setDeleteTarget({ dest, clinicId: clinic.id })}
          />
        ))
      )}
    </div>
  );
}

function ClinicStorageCard({
  clinic, canConfigure, isSuperAdmin, onAdd, onEdit, onDelete,
}: {
  clinic: FlatClinic;
  canConfigure: boolean;
  isSuperAdmin: boolean;
  onAdd: () => void;
  onEdit: (dest: StorageDest) => void;
  onDelete: (dest: StorageDest) => void;
}) {
  const toggleActive = useToggleActive(clinic.id);
  const city = clinic.addressCity ?? clinic.address?.city;
  const state = clinic.addressState ?? clinic.address?.state;
  const destinations = clinic.storageDestinations || [];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground text-sm">{clinic.name}</h3>
          {city && <p className="text-xs text-muted-foreground mt-0.5">{city}, {state}</p>}
        </div>
        {canConfigure && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium"
          >
            <Plus size={12} />
            Adicionar Destino
          </button>
        )}
      </div>

      {destinations.length === 0 ? (
        <div className="px-5 py-8 text-center text-muted-foreground text-sm">
          Nenhum destino de armazenamento configurado
        </div>
      ) : (
        <div className="divide-y divide-border">
          {destinations.map((dest) => {
            const Icon = typeIcons[dest.type] || HardDrive;
            return (
              <div key={dest.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  dest.isActive ? 'bg-muted' : 'bg-muted/40',
                )}>
                  <Icon size={18} className={dest.isActive ? 'text-muted-foreground' : 'text-muted-foreground/40'} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn('font-medium text-sm', !dest.isActive && 'text-muted-foreground')}>{dest.name}</p>
                    {dest.isDefault && (
                      <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium">Padrão</span>
                    )}
                    {!dest.isActive && (
                      <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded">Inativo</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{typeLabels[dest.type] || dest.type}</p>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={11} />
                  {dest.lastSyncAt ? timeAgo(dest.lastSyncAt) : 'Nunca'}
                </div>

                {dest.lastSyncStatus && (
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium border',
                    dest.lastSyncStatus === 'success'
                      ? 'text-status-success bg-status-success/10 border-status-success/20'
                      : dest.lastSyncStatus === 'failed'
                      ? 'text-status-error bg-status-error/10 border-status-error/20'
                      : 'text-status-warning bg-status-warning/10 border-status-warning/20',
                  )}>
                    {dest.lastSyncStatus}
                  </span>
                )}

                {canConfigure && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive.mutate({ dest, active: !dest.isActive })}
                      disabled={toggleActive.isPending}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={dest.isActive ? 'Inativar' : 'Ativar'}
                    >
                      {dest.isActive
                        ? <ToggleRight size={16} className="text-status-success" />
                        : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => onEdit(dest)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => onDelete(dest)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir (Super Admin)"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
