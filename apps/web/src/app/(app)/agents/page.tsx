'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { EdgeAgent, PaginatedResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server, Wifi, WifiOff, RefreshCw, Clock, Cpu, MemoryStick,
  HardDrive, Plus, Copy, Check, Trash2, AlertTriangle, Loader2, Key, Ticket,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { cn, statusColors, timeAgo } from '@/lib/utils';

interface Clinic { id: string; name: string }

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

function MetricBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
      <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Copiar">
      {copied ? <Check size={14} className="text-status-success" /> : <Copy size={14} />}
    </button>
  );
}

const registerSchema = z.object({
  clinicId: z.string().uuid('Selecione uma clínica'),
  name: z.string().min(2, 'Nome obrigatório').max(100),
  dicomAeTitle: z.string().min(1).max(16).default('SMARTPACS'),
  dicomPort: z.coerce.number().int().min(1024).max(65535).default(104),
});
type RegisterForm = z.infer<typeof registerSchema>;

interface RegisteredAgent {
  agentId: string;
  apiKey: string;
  config: Record<string, unknown>;
}

function RegisterAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [registered, setRegistered] = useState<RegisteredAgent | null>(null);

  const { data: clinicsData } = useQuery({
    queryKey: ['clinics-dropdown'],
    queryFn: () => api.get<{ data: PaginatedResponse<Clinic> }>('/clinics?limit=100').then((r) => r.data.data),
    enabled: open,
  });
  const clinics = clinicsData?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { dicomAeTitle: 'SMARTPACS', dicomPort: 104 },
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      api.post<{ data: RegisteredAgent }>('/agents', {
        clinicId: data.clinicId,
        name: data.name,
        version: '1.0.0',
        hostname: '',
        platform: 'unknown',
        dicomConfig: {
          aeTitle: data.dicomAeTitle,
          port: data.dicomPort,
          allowedCallingAeTitles: [],
          receiveDirectory: './storage/received',
          processedDirectory: './storage/processed',
          failedDirectory: './storage/failed',
        },
      }).then((r) => r.data.data),
    onSuccess: (data) => {
      setRegistered(data);
      queryClient.invalidateQueries({ queryKey: ['agents-full'] });
    },
  });

  const handleClose = () => {
    reset();
    setRegistered(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        {!registered ? (
          <>
            <DialogHeader>
              <DialogTitle>Registrar Agente Edge</DialogTitle>
              <DialogDescription>
                Instale o SmartPACS Edge Agent em uma workstation e configure com as credenciais geradas.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
              <DialogBody className="space-y-4">
                {mutation.isError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {(mutation.error as any)?.response?.data?.message || 'Erro ao registrar agente'}
                  </div>
                )}
                <Field label="Clínica *" error={errors.clinicId?.message}>
                  <select {...register('clinicId')} className={inputClass}>
                    <option value="">Selecione uma clínica...</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nome do agente *" error={errors.name?.message} hint="Ex.: Workstation Sala 1, PC-ULTRASSOM">
                  <input {...register('name')} placeholder="Workstation Sala 1" className={inputClass} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="AE Title DICOM" error={errors.dicomAeTitle?.message} hint="Máx. 16 caracteres">
                    <input {...register('dicomAeTitle')} placeholder="SMARTPACS" className={inputClass} />
                  </Field>
                  <Field label="Porta DICOM" error={errors.dicomPort?.message} hint="Padrão: 104">
                    <input {...register('dicomPort')} type="number" placeholder="104" className={inputClass} />
                  </Field>
                </div>
              </DialogBody>
              <DialogFooter>
                <button type="button" onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={mutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {mutation.isPending ? 'Registrando...' : 'Registrar Agente'}
                </button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check size={18} className="text-status-success" />
                Agente registrado com sucesso!
              </DialogTitle>
              <DialogDescription>
                Copie a API Key abaixo — ela será exibida uma única vez. Configure o arquivo{' '}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">.env</code> do Edge Agent com esses valores.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-lg flex items-start gap-3">
                <Key size={16} className="text-status-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-status-warning">
                  Guarde a API Key em local seguro. Não é possível recuperá-la após fechar esta tela.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">EDGE_AGENT_ID</label>
                  <div className="flex items-center gap-2 font-mono text-xs bg-muted/50 border border-input rounded-lg px-3 py-2">
                    <span className="flex-1 truncate text-foreground">{registered.agentId}</span>
                    <CopyButton text={registered.agentId} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">EDGE_AGENT_API_KEY</label>
                  <div className="flex items-center gap-2 font-mono text-xs bg-muted/50 border border-status-warning/40 rounded-lg px-3 py-2">
                    <span className="flex-1 truncate text-foreground">{registered.apiKey}</span>
                    <CopyButton text={registered.apiKey} />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted/50 border border-border rounded-lg">
                <p className="text-xs font-medium text-foreground mb-2">Próximos passos:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Copie o arquivo <code className="font-mono bg-muted px-1 rounded">.env.example</code> para <code className="font-mono bg-muted px-1 rounded">.env</code> no Edge Agent</li>
                  <li>Cole os valores EDGE_AGENT_ID e EDGE_AGENT_API_KEY no arquivo .env</li>
                  <li>Execute <code className="font-mono bg-muted px-1 rounded">npm run dev</code> (ou <code className="font-mono bg-muted px-1 rounded">npm start</code> em produção)</li>
                  <li>O agente aparecerá como Online em até 30 segundos</li>
                </ol>
              </div>
            </DialogBody>
            <DialogFooter>
              <button onClick={handleClose}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                Concluir
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const enrollmentSchema = z.object({
  clinicId: z.string().uuid('Selecione uma clínica'),
  name: z.string().min(2, 'Nome obrigatório').max(100),
});
type EnrollmentForm = z.infer<typeof enrollmentSchema>;

interface EnrollmentToken {
  token: string;
  expiresAt: string;
}

function EnrollmentTokenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [issued, setIssued] = useState<EnrollmentToken | null>(null);

  const { data: clinicsData } = useQuery({
    queryKey: ['clinics-dropdown'],
    queryFn: () => api.get<{ data: PaginatedResponse<Clinic> }>('/clinics?limit=100').then((r) => r.data.data),
    enabled: open,
  });
  const clinics = clinicsData?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EnrollmentForm>({
    resolver: zodResolver(enrollmentSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: EnrollmentForm) =>
      api.post<{ data: EnrollmentToken }>('/agents/enrollment-tokens', data).then((r) => r.data.data),
    onSuccess: (data) => setIssued(data),
  });

  const handleClose = () => {
    reset();
    setIssued(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        {!issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Gerar Token de Provisionamento</DialogTitle>
              <DialogDescription>
                Gere um token de uso único para que o agente se registre automaticamente no primeiro boot,
                sem precisar copiar EDGE_AGENT_ID/API_KEY manualmente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
              <DialogBody className="space-y-4">
                {mutation.isError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {(mutation.error as any)?.response?.data?.message || 'Erro ao gerar token'}
                  </div>
                )}
                <Field label="Clínica *" error={errors.clinicId?.message}>
                  <select {...register('clinicId')} className={inputClass}>
                    <option value="">Selecione uma clínica...</option>
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nome do agente *" error={errors.name?.message} hint="Ex.: Workstation Sala 1, PC-ULTRASSOM">
                  <input {...register('name')} placeholder="Workstation Sala 1" className={inputClass} />
                </Field>
              </DialogBody>
              <DialogFooter>
                <button type="button" onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={mutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {mutation.isPending ? 'Gerando...' : 'Gerar Token'}
                </button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check size={18} className="text-status-success" />
                Token gerado com sucesso!
              </DialogTitle>
              <DialogDescription>
                Copie o token abaixo — ele será exibido uma única vez e expira em{' '}
                {new Date(issued.expiresAt).toLocaleString('pt-BR')}.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-lg flex items-start gap-3">
                <Key size={16} className="text-status-warning mt-0.5 flex-shrink-0" />
                <p className="text-xs text-status-warning">
                  Guarde o token em local seguro. Ele só pode ser usado uma vez e não pode ser recuperado depois.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">EDGE_AGENT_ENROLLMENT_TOKEN</label>
                <div className="flex items-center gap-2 font-mono text-xs bg-muted/50 border border-status-warning/40 rounded-lg px-3 py-2">
                  <span className="flex-1 truncate text-foreground">{issued.token}</span>
                  <CopyButton text={issued.token} />
                </div>
              </div>

              <div className="p-3 bg-muted/50 border border-border rounded-lg">
                <p className="text-xs font-medium text-foreground mb-2">Próximos passos:</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Copie o arquivo <code className="font-mono bg-muted px-1 rounded">.env.example</code> para <code className="font-mono bg-muted px-1 rounded">.env</code> no Edge Agent</li>
                  <li>Cole o valor em <code className="font-mono bg-muted px-1 rounded">EDGE_AGENT_ENROLLMENT_TOKEN</code> no arquivo .env</li>
                  <li>Execute <code className="font-mono bg-muted px-1 rounded">npm run dev</code> (ou <code className="font-mono bg-muted px-1 rounded">npm start</code> em produção)</li>
                  <li>O agente se registra automaticamente no primeiro boot e aparecerá como Online em até 30 segundos</li>
                </ol>
              </div>
            </DialogBody>
            <DialogFooter>
              <button onClick={handleClose}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                Concluir
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeConfirmModal({ agent, onClose }: { agent: EdgeAgent | null; onClose: () => void }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.delete(`/agents/${agent!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents-full'] });
      onClose();
    },
  });

  return (
    <Dialog open={!!agent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} />
            Revogar Agente
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja revogar o agente <strong>{agent?.name}</strong>?
            Ele perderá acesso imediatamente e deixará de enviar heartbeats.
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <div className="px-6 py-2 text-sm text-destructive">
            {(mutation.error as any)?.response?.data?.message || 'Erro ao revogar agente'}
          </div>
        )}
        <DialogFooter>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Revogando...' : 'Revogar Agente'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const [showRegister, setShowRegister] = useState(false);
  const [showEnrollmentToken, setShowEnrollmentToken] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<EdgeAgent | null>(null);
  const { can } = usePermission();

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['agents-full'],
    queryFn: () =>
      api.get<{ data: PaginatedResponse<EdgeAgent> }>('/agents?limit=50').then((r) => r.data.data),
    refetchInterval: 15000,
  });

  const agents = data?.data || [];
  const online = agents.filter((a) => a.status === 'ONLINE').length;
  const degraded = agents.filter((a) => a.status === 'DEGRADED').length;
  const offline = agents.filter((a) => a.status === 'OFFLINE').length;

  return (
    <div className="space-y-6">
      <RegisterAgentModal open={showRegister} onClose={() => setShowRegister(false)} />
      <EnrollmentTokenModal open={showEnrollmentToken} onClose={() => setShowEnrollmentToken(false)} />
      <RevokeConfirmModal agent={revokeTarget} onClose={() => setRevokeTarget(null)} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Online', count: online, color: 'text-status-success', bg: 'bg-status-success/10' },
          { label: 'Degradado', count: degraded, color: 'text-status-warning', bg: 'bg-status-warning/10' },
          { label: 'Offline', count: offline, color: 'text-status-error', bg: 'bg-status-error/10' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bg)}>
              {label === 'Online' ? <Wifi size={18} className={color} /> : <WifiOff size={18} className={color} />}
            </div>
            <div>
              <p className={cn('text-2xl font-bold', color)}>{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {agents.length} agente{agents.length !== 1 ? 's' : ''} registrado{agents.length !== 1 ? 's' : ''} ·{' '}
          atualizado {timeAgo(new Date(dataUpdatedAt).toISOString())}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {can('clinics:write') && (
            <button onClick={() => setShowEnrollmentToken(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground hover:bg-muted transition-colors">
              <Ticket size={14} />
              Gerar Token de Provisionamento
            </button>
          )}
          {can('clinics:write') && (
            <button onClick={() => setShowRegister(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus size={14} />
              Registrar Agente
            </button>
          )}
        </div>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-52 skeleton rounded-xl" />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          <Server size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum agente registrado</p>
          <p className="text-xs mt-1 mb-4">Instale o SmartPACS Edge Agent em uma workstation</p>
          {can('clinics:write') && (
            <button onClick={() => setShowRegister(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus size={14} />
              Registrar primeiro agente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Server size={16} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.hostname || 'Hostname desconhecido'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
                    statusColors[agent.status] || 'text-muted-foreground bg-muted border-muted',
                  )}>
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      agent.status === 'ONLINE' ? 'bg-current animate-pulse' : 'bg-current opacity-50',
                    )} />
                    {agent.status}
                  </span>
                  {can('clinics:write') && (
                    <button
                      onClick={() => setRevokeTarget(agent)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Revogar agente"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock size={11} />
                  <span>Último heartbeat: {timeAgo(agent.lastHeartbeatAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                    {(agent as any).dicomAeTitle || agent.dicomConfig?.aeTitle || '—'}
                  </span>
                  <span>:{(agent as any).dicomPort || agent.dicomConfig?.port || '—'}</span>
                </div>
              </div>

              {agent.metrics && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1"><Cpu size={10} /> CPU</span>
                    <span>{agent.metrics.cpuUsagePercent.toFixed(1)}%</span>
                  </div>
                  <MetricBar
                    value={agent.metrics.cpuUsagePercent}
                    max={100}
                    color={agent.metrics.cpuUsagePercent > 80 ? 'bg-status-error' : agent.metrics.cpuUsagePercent > 60 ? 'bg-status-warning' : 'bg-status-info'}
                  />

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 mt-2">
                    <span className="flex items-center gap-1"><MemoryStick size={10} /> RAM</span>
                    <span>{agent.metrics.memoryUsedMB.toFixed(0)} / {agent.metrics.memoryTotalMB.toFixed(0)} MB</span>
                  </div>
                  <MetricBar
                    value={agent.metrics.memoryUsedMB}
                    max={agent.metrics.memoryTotalMB}
                    color={agent.metrics.memoryUsedMB / agent.metrics.memoryTotalMB > 0.85 ? 'bg-status-error' : 'bg-status-warning'}
                  />

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 mt-2">
                    <span className="flex items-center gap-1"><HardDrive size={10} /> Disco</span>
                    <span>{agent.metrics.diskUsedGB.toFixed(1)} / {agent.metrics.diskTotalGB.toFixed(1)} GB</span>
                  </div>
                  <MetricBar
                    value={agent.metrics.diskUsedGB}
                    max={agent.metrics.diskTotalGB}
                    color={agent.metrics.diskUsedGB / agent.metrics.diskTotalGB > 0.85 ? 'bg-status-error' : 'bg-status-success'}
                  />
                </div>
              )}

              {(agent as any).queueStats && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-4 gap-1 text-center">
                  {[
                    { label: 'Aguard.', value: (agent as any).queueStats?.pending || 0, color: 'text-muted-foreground' },
                    { label: 'Upload', value: (agent as any).queueStats?.processing || 0, color: 'text-status-info' },
                    { label: 'Erro', value: (agent as any).queueStats?.failed || 0, color: 'text-status-error' },
                    { label: 'OK', value: (agent as any).queueStats?.completed || 0, color: 'text-status-success' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className={cn('text-sm font-bold', color)}>{value}</p>
                      <p className="text-xs text-muted-foreground/70">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>{agent.platform} · v{agent.version}</span>
                {(agent as any).ipAddress && <span className="font-mono">{(agent as any).ipAddress}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
