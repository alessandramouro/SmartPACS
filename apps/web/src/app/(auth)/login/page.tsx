'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginResponse } from '@smartpacs/types';
import { Eye, EyeOff, Loader2, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';


const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  mfaCode: z.string().length(6).optional().or(z.literal('')),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  // All hooks must be called before any conditional return
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const onSubmit = async (data: LoginForm) => {
    setError('');
    try {
      const res = await api.post<{ data: LoginResponse }>('/auth/login', {
        email: data.email,
        password: data.password,
        mfaCode: data.mfaCode || undefined,
      });

      const response = res.data.data;

      if (response.requiresMfa) {
        setRequiresMfa(true);
        return;
      }

      if (response.requiresPasswordChange) {
        router.push(`/reset-password?token=${response.passwordResetToken}`);
        return;
      }

      login(response.user, response.accessToken, response.refreshToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; statusCode?: number } }; message?: string };
      const apiMsg = axiosErr.response?.data?.message;
      if (apiMsg === 'Invalid credentials' || axiosErr.response?.data?.statusCode === 401) {
        setError('Email ou senha incorretos');
      } else if (apiMsg) {
        setError(apiMsg);
      } else {
        setError('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">SmartPACS</h1>
            <p className="text-xs text-muted-foreground">Medical Imaging Platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-foreground mb-1">
            {requiresMfa ? 'Autenticação em dois fatores' : 'Entrar na plataforma'}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {requiresMfa
              ? 'Digite o código do seu aplicativo autenticador'
              : 'Acesse o painel administrativo do SmartPACS'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {!requiresMfa && (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Email
                  </label>
                  <input
                    {...register('email')}
                    type="email"
                    placeholder="seu@email.com"
                    autoComplete="email"
                    className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      {...register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 pr-10 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>
              </>
            )}

            {requiresMfa && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Código MFA (6 dígitos)
                </label>
                <input
                  {...register('mfaCode')}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm text-center font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all text-xl tracking-widest"
                />
                {errors.mfaCode && (
                  <p className="mt-1 text-xs text-destructive">{errors.mfaCode.message}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Entrando...' : requiresMfa ? 'Verificar' : 'Entrar'}
            </button>

            {!requiresMfa && (
              <div className="text-center">
                <a
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Esqueceu a senha?
                </a>
              </div>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SmartPACS v1.0 · LGPD/HIPAA Compliant
        </p>
      </div>
    </div>
  );
}
