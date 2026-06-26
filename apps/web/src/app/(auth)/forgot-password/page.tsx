'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Activity, Mail, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Email inválido'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await api.post('/auth/password/reset', data);
    } finally {
      // Always show the same confirmation, whether or not the email exists,
      // to avoid leaking which addresses are registered.
      setDone(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">SmartPACS</h1>
            <p className="text-xs text-muted-foreground">Medical Imaging Platform</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-status-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-status-success" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Verifique seu email</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Se houver uma conta associada a este email, enviamos um link para redefinir sua senha.
                O link expira em 2 horas.
              </p>
              <a href="/login" className="text-sm text-primary hover:underline">Voltar para o login →</a>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-1">Esqueceu sua senha?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      {...register('email')}
                      type="email"
                      placeholder="seu@email.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2.5 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                    />
                  </div>
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>

                <div className="text-center">
                  <a href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Voltar para o login
                  </a>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SmartPACS v1.0 · LGPD/HIPAA Compliant
        </p>
      </div>
    </div>
  );
}
