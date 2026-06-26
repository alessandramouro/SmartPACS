'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { User, Clinic, PaginatedResponse, CreateUserResponse, ResetPasswordResponse } from '@smartpacs/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Search, Plus, RefreshCw, Shield, ChevronLeft, ChevronRight, Loader2, Pencil, Trash2, KeyRound,
  RotateCcw, Check, Copy, Key,
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
import { cn, statusColors, formatDateTime } from '@/lib/utils';

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Admin Tenant',
  CLINIC_ADMIN: 'Admin Clínica',
  OPERATOR: 'Operador',
  PHYSICIAN: 'Médico',
  READONLY: 'Somente Leitura',
};

const roleBadgeColors: Record<string, string> = {
  SUPER_ADMIN: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  TENANT_ADMIN: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  CLINIC_ADMIN: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  OPERATOR: 'text-green-400 bg-green-400/10 border-green-400/20',
  PHYSICIAN: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  READONLY: 'text-muted-foreground bg-muted border-muted',
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

// ─── Shared ──────────────────────────────────────────────────

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

function TemporaryPasswordNotice({ password }: { password: string }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-status-warning/10 border border-status-warning/20 rounded-lg flex items-start gap-3">
        <Key size={16} className="text-status-warning mt-0.5 flex-shrink-0" />
        <p className="text-xs text-status-warning">
          Copie a senha abaixo — ela é exibida uma única vez e não pode ser recuperada depois.
          O usuário será obrigado a definir uma nova senha no primeiro login.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Senha temporária</label>
        <div className="flex items-center gap-2 font-mono text-sm bg-muted/50 border border-status-warning/40 rounded-lg px-3 py-2">
          <span className="flex-1 truncate text-foreground">{password}</span>
          <CopyButton text={password} />
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ────────────────────────────────────────────

const createSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(255),
  role: z.enum(['TENANT_ADMIN', 'CLINIC_ADMIN', 'OPERATOR', 'PHYSICIAN', 'READONLY']),
  clinicId: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'OPERATOR' },
  });
  const selectedRole = watch('role');
  const [validationError, setValidationError] = useState('');
  const [created, setCreated] = useState<CreateUserResponse | null>(null);

  const { data: clinicsData } = useQuery({
    queryKey: ['clinics-select'],
    queryFn: () => api.get<{ data: PaginatedResponse<Clinic> }>('/clinics?limit=100').then((r) => r.data.data),
    enabled: open,
  });
  const clinics = clinicsData?.data || [];

  const mutation = useMutation({
    mutationFn: (data: CreateForm) => {
      const payload: Record<string, unknown> = { email: data.email, name: data.name, role: data.role };
      if (data.clinicId && data.clinicId !== '') payload.clinicId = data.clinicId;
      return api.post<{ data: CreateUserResponse }>('/users', payload).then((r) => r.data.data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setValidationError('');
      setCreated(data);
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data?.errors?.length) {
        setValidationError(data.errors.join(' | '));
      } else if (data?.message) {
        setValidationError(data.message === 'Email already registered in this tenant'
          ? 'Este email já está cadastrado neste sistema.'
          : data.message);
      }
    },
  });

  const onSubmit = handleSubmit(
    (data) => {
      setValidationError('');
      mutation.mutate(data);
    },
    (fieldErrors) => {
      const msgs = Object.values(fieldErrors).map((e: any) => e?.message).filter(Boolean);
      setValidationError(msgs.join(' | ') || 'Verifique os campos obrigatórios');
    },
  );

  const handleClose = () => {
    reset();
    setCreated(null);
    setValidationError('');
    onClose();
  };

  const needsClinic = ['CLINIC_ADMIN', 'OPERATOR', 'PHYSICIAN', 'READONLY'].includes(selectedRole);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Cadastrar Usuário</DialogTitle>
              <DialogDescription>O usuário é criado e ativado imediatamente, sem envio de email.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit}>
              <DialogBody className="space-y-4">
                {(validationError || mutation.isError) && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {validationError || (mutation.error as any)?.response?.data?.message || 'Erro ao cadastrar usuário'}
                  </div>
                )}
                <Field label="Email *" error={errors.email?.message}>
                  <input {...register('email')} type="email" placeholder="usuario@empresa.com" className={inputClass} autoComplete="off" />
                </Field>
                <Field label="Nome completo *" error={errors.name?.message}>
                  <input {...register('name')} placeholder="João Silva" className={inputClass} />
                </Field>
                <Field label="Perfil de acesso *" error={errors.role?.message}>
                  <select {...register('role')} className={inputClass}>
                    {Object.entries(roleLabels).filter(([k]) => k !== 'SUPER_ADMIN').map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                {needsClinic && (
                  <Field label="Clínica" error={errors.clinicId?.message}>
                    <select {...register('clinicId')} className={inputClass}>
                      <option value="">Sem clínica específica</option>
                      {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                )}
              </DialogBody>
              <DialogFooter>
                <button type="button" onClick={handleClose}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={mutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {mutation.isPending ? 'Cadastrando...' : 'Cadastrar Usuário'}
                </button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check size={18} className="text-status-success" />
                Usuário cadastrado com sucesso!
              </DialogTitle>
              <DialogDescription>{created.email}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TemporaryPasswordNotice password={created.temporaryPassword} />
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

// ─── Edit Modal ──────────────────────────────────────────────

const editSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(255),
  role: z.enum(['TENANT_ADMIN', 'CLINIC_ADMIN', 'OPERATOR', 'PHYSICIAN', 'READONLY']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  clinicId: z.string().uuid().optional().or(z.literal('')),
});
type EditForm = z.infer<typeof editSchema>;

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
};

function EditUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });
  const selectedRole = watch('role');

  const { data: clinicsData } = useQuery({
    queryKey: ['clinics-select'],
    queryFn: () => api.get<{ data: PaginatedResponse<Clinic> }>('/clinics?limit=100').then((r) => r.data.data),
    enabled: !!user,
  });
  const clinics = clinicsData?.data || [];

  useEffect(() => {
    if (user) {
      reset({
        email: user.email,
        name: user.name,
        role: (user.role === 'SUPER_ADMIN' ? 'TENANT_ADMIN' : user.role) as EditForm['role'],
        status: (user.status?.toUpperCase() as EditForm['status']) || 'ACTIVE',
        clinicId: user.clinicId ?? '',
      });
    }
  }, [user, reset]);

  const [emailError, setEmailError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: EditForm) => api.put(`/users/${user!.id}`, {
      email: data.email,
      name: data.name,
      role: data.role,
      status: data.status,
      ...(data.clinicId ? { clinicId: data.clinicId } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      setEmailError(msg === 'Email already registered in this tenant' ? 'Este email já está cadastrado neste sistema.' : '');
    },
  });

  const needsClinic = ['CLINIC_ADMIN', 'OPERATOR', 'PHYSICIAN', 'READONLY'].includes(selectedRole);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { setEmailError(''); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <DialogBody className="space-y-4">
            {mutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {emailError || (mutation.error as any)?.response?.data?.message || 'Erro ao atualizar usuário'}
              </div>
            )}

            {isSuperAdmin && (
              <div className="p-3 bg-status-warning/10 border border-status-warning/20 rounded-lg text-status-warning text-xs">
                Usuário Super Admin — apenas o nome pode ser alterado por esta interface.
              </div>
            )}

            <Field label="Nome completo *" error={errors.name?.message}>
              <input {...register('name')} placeholder="João Silva" className={inputClass} />
            </Field>

            {!isSuperAdmin && (
              <>
                <Field label="Email *" error={errors.email?.message}>
                  <input {...register('email')} type="email" placeholder="usuario@empresa.com" className={inputClass} autoComplete="off" />
                </Field>

                <Field label="Perfil de acesso *" error={errors.role?.message}>
                  <select {...register('role')} className={inputClass}>
                    {Object.entries(roleLabels).filter(([k]) => k !== 'SUPER_ADMIN').map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Status *" error={errors.status?.message}>
                  <select {...register('status')} className={inputClass}>
                    {Object.entries(statusLabels).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>

                {needsClinic && (
                  <Field label="Clínica" error={errors.clinicId?.message}>
                    <select {...register('clinicId')} className={inputClass}>
                      <option value="">Sem clínica específica</option>
                      {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                )}
              </>
            )}
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

// ─── Reset Password Modal (direct, no email) ──────────────────

function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [result, setResult] = useState<ResetPasswordResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post<{ data: ResetPasswordResponse }>(`/users/${user!.id}/reset-password`).then((r) => r.data.data),
    onSuccess: (data) => setResult(data),
  });

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Redefinir senha diretamente?</DialogTitle>
              <DialogDescription>
                Gera uma nova senha para <strong>{user?.name}</strong> ({user?.email}) sem depender de envio de email.
                A senha atual deixa de funcionar e todas as sessões ativas serão encerradas.
              </DialogDescription>
            </DialogHeader>
            {mutation.isError && (
              <div className="px-6 py-2 text-sm text-destructive">
                {(mutation.error as any)?.response?.data?.message || 'Erro ao redefinir senha'}
              </div>
            )}
            <DialogFooter>
              <button onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
              <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {mutation.isPending ? 'Redefinindo...' : 'Redefinir Senha'}
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check size={18} className="text-status-success" />
                Senha redefinida!
              </DialogTitle>
              <DialogDescription>{user?.email}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TemporaryPasswordNotice password={result.temporaryPassword} />
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

// ─── Delete Modal ────────────────────────────────────────────

function DeleteUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.delete(`/users/${user!.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); onClose(); },
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir usuário?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O usuário <strong>{user?.name}</strong> ({user?.email}) será removido permanentemente.
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <div className="px-6 pb-2">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {(mutation.error as any)?.response?.data?.message || 'Erro ao excluir usuário'}
            </div>
          </div>
        )}
        <DialogFooter>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Excluindo...' : 'Excluir Usuário'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [sendingReset, setSendingReset] = useState<string | null>(null);
  const { can, is } = usePermission();

  const handleSendReset = async (user: User) => {
    setSendingReset(user.id);
    try {
      await api.post(`/users/${user.id}/send-reset`);
      alert(`Link de redefinição enviado para ${user.email}`);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar reset de senha');
    } finally {
      setSendingReset(null);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users', page, search, selectedRole],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(), limit: '20',
        ...(search && { q: search }),
        ...(selectedRole && { role: selectedRole }),
      });
      return api.get<{ data: PaginatedResponse<User> }>(`/users?${params}`).then((r) => r.data.data);
    },
    placeholderData: (prev) => prev,
  });

  const users = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} />
      <DeleteUserModal user={deleteUser} onClose={() => setDeleteUser(null)} />
      <ResetPasswordModal user={resetPasswordUser} onClose={() => setResetPasswordUser(null)} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Nome, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground">
          <option value="">Todos os perfis</option>
          {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => refetch()}
          className="p-2 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
        {can('users:write') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors ml-auto">
            <Plus size={14} /> Cadastrar Usuário
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Perfil</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">MFA</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Último Login</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Logins</th>
                {(can('users:write') || is('SUPER_ADMIN')) && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">{user.name?.charAt(0)?.toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                        roleBadgeColors[user.role] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        <Shield size={10} />
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        statusColors[user.status?.toUpperCase()] || 'text-muted-foreground bg-muted border-muted',
                      )}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs font-medium', user.mfaEnabled ? 'text-status-success' : 'text-muted-foreground')}>
                        {user.mfaEnabled ? '✓ Ativo' : '— Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.loginCount?.toLocaleString('pt-BR')}</td>
                    {(can('users:write') || is('SUPER_ADMIN')) && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {can('users:write') && (
                            <button
                              onClick={() => setEditUser(user)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar usuário"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {can('users:write') && (
                            <button
                              onClick={() => handleSendReset(user)}
                              disabled={sendingReset === user.id}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-status-warning transition-colors disabled:opacity-40"
                              title="Enviar link de redefinição por email"
                            >
                              {sendingReset === user.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <KeyRound size={13} />}
                            </button>
                          )}
                          {can('users:write') && (
                            <button
                              onClick={() => setResetPasswordUser(user)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-status-warning transition-colors"
                              title="Redefinir senha diretamente (sem email)"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                          {is('SUPER_ADMIN') && user.role !== 'SUPER_ADMIN' && (
                            <button
                              onClick={() => setDeleteUser(user)}
                              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir usuário"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
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
