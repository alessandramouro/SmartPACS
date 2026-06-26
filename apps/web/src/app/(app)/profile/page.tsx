'use client';

import type { MfaSetupResponse } from '@smartpacs/types';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, Loader2, KeyRound, Copy, Check } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';


const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Admin do Tenant',
  CLINIC_ADMIN: 'Admin da Clínica',
  OPERATOR: 'Operador',
  PHYSICIAN: 'Médico',
  READONLY: 'Somente leitura',
};

function MfaNotAvailable() {
  return (
    <p className="text-sm text-muted-foreground">
      A autenticação em duas etapas não está disponível no plano do seu tenant.
      Fale com o administrador para habilitar essa funcionalidade.
    </p>
  );
}

function MfaSetupFlow({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const { user, setUser } = useAuthStore();
  const [blocked, setBlocked] = useState(false);

  const setupMutation = useMutation({
    mutationFn: () => api.post<{ data: MfaSetupResponse }>('/auth/mfa/setup').then((r) => r.data.data),
    onSuccess: setSetup,
    onError: (err: any) => {
      if (err?.response?.status === 403) {
        setBlocked(true);
      } else {
        toast({ title: 'Falha ao iniciar configuração de MFA', variant: 'destructive' });
      }
    },
  });

  const enableMutation = useMutation({
    mutationFn: () => api.post('/auth/mfa/enable', { code }),
    onSuccess: () => {
      toast({ title: 'MFA ativado com sucesso' });
      if (user) setUser({ ...user, mfaEnabled: true });
      onDone();
    },
    onError: () => {
      toast({ title: 'Código inválido', description: 'Verifique o código no seu aplicativo autenticador.', variant: 'destructive' });
    },
  });

  if (blocked) return <MfaNotAvailable />;

  if (!setup) {
    return (
      <button
        onClick={() => setupMutation.mutate()}
        disabled={setupMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {setupMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        Ativar MFA
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <img src={setup.qrCodeUrl} alt="QR Code MFA" className="w-36 h-36 rounded-lg border border-border" />
        <div className="text-xs text-muted-foreground space-y-2 flex-1">
          <p>1. Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc).</p>
          <p>2. Ou digite o código manualmente:</p>
          <div className="flex items-center gap-1.5">
            <code className="bg-muted px-2 py-1 rounded font-mono text-foreground text-xs break-all">{setup.secret}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <p className="pt-2">3. Guarde os códigos de backup em local seguro (cada um pode ser usado uma vez se você perder acesso ao app):</p>
          <div className="grid grid-cols-2 gap-1 font-mono bg-muted/50 rounded-lg p-2">
            {setup.backupCodes.map((c) => <span key={c}>{c}</span>)}
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2 pt-2 border-t border-border">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Código do app autenticador</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm font-mono tracking-widest text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => enableMutation.mutate()}
          disabled={code.length !== 6 || enableMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {enableMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

function MfaDisableFlow({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const { user, setUser } = useAuthStore();

  const disableMutation = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { code }),
    onSuccess: () => {
      toast({ title: 'MFA desativado' });
      if (user) setUser({ ...user, mfaEnabled: false });
      onDone();
    },
    onError: () => {
      toast({ title: 'Código inválido', variant: 'destructive' });
    },
  });

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 max-w-[200px]">
        <label className="block text-xs text-muted-foreground mb-1">Confirme com o código atual do MFA</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm font-mono tracking-widest text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        onClick={() => disableMutation.mutate()}
        disabled={code.length !== 6 || disableMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
      >
        {disableMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Desativar MFA'}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [disabling, setDisabling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Minha Conta</h2>
        <p className="text-sm text-muted-foreground mt-1">Informações do seu usuário e configurações de segurança.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <KeyRound size={14} /> Informações
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="text-foreground font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-foreground font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Função</p>
            <p className="text-foreground font-medium">{roleLabels[user.role] || user.role}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            {user.mfaEnabled ? <ShieldCheck size={14} className="text-status-success" /> : <ShieldOff size={14} className="text-muted-foreground" />}
            Autenticação em Duas Etapas (MFA)
          </h3>
          {user.mfaEnabled && (
            <span className="px-2 py-0.5 text-xs rounded border bg-status-success/10 text-status-success border-status-success/20">
              Ativo
            </span>
          )}
        </div>

        {user.mfaEnabled ? (
          disabling ? (
            <MfaDisableFlow onDone={() => setDisabling(false)} />
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Sua conta está protegida com um código de verificação adicional no login.</p>
              <button
                onClick={() => setDisabling(true)}
                className="text-sm text-destructive hover:underline"
              >
                Desativar
              </button>
            </div>
          )
        ) : (
          <MfaSetupFlow key={refreshKey} onDone={() => setRefreshKey((k) => k + 1)} />
        )}
      </div>
    </div>
  );
}
