import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import * as nodemailer from 'nodemailer';

import { PrismaService } from '../../prisma/prisma.service';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  tenantId?: string;
  userId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const user = configService.get<string>('email.user');
    const pass = configService.get<string>('email.pass');
    this.transporter = nodemailer.createTransport({
      host: configService.get('email.host'),
      port: configService.get('email.port'),
      secure: configService.get('email.secure'),
      // Only include auth if credentials are configured (Mailpit doesn't need auth)
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    await this.notificationQueue.add('send-email', options, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async sendWelcomeEmail(email: string, name: string, tempPassword?: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Bem-vindo ao SmartPACS',
      html: `
        <h2>Olá, ${name}!</h2>
        <p>Sua conta no SmartPACS foi criada.</p>
        ${tempPassword ? `<p>Senha temporária: <strong>${tempPassword}</strong></p><p>Por favor, altere-a no primeiro acesso.</p>` : ''}
        <p><a href="${this.configService.get('app.url')}/login">Acessar SmartPACS</a></p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const appUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await this.sendEmail({
      to: email,
      subject: 'Redefinição de senha — SmartPACS',
      html: this.emailTemplate({
        title: 'Redefinição de senha',
        greeting: `Olá, <strong>${name}</strong>!`,
        body: 'Recebemos uma solicitação para redefinir a senha da sua conta no SmartPACS.',
        ctaUrl: resetUrl,
        ctaLabel: 'Redefinir minha senha',
        footer: 'Este link expira em <strong>2 horas</strong>.<br>Se não foi você quem solicitou, ignore este email — sua senha permanece a mesma.',
      }),
    });
  }

  async sendExportFailedAlert(
    email: string,
    studyId: string,
    destinationName: string,
    error: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>('app.url', 'http://localhost:3000');
    await this.sendEmail({
      to: email,
      subject: `[SmartPACS] Falha na exportação — ${destinationName}`,
      html: this.emailTemplate({
        title: 'Falha na exportação',
        greeting: 'Atenção — exportação com falha',
        body: `O estudo <strong>${studyId}</strong> falhou ao ser exportado para <strong>${destinationName}</strong>.<br><br>Erro: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${error}</code>`,
        ctaUrl: `${appUrl}/studies/${studyId}`,
        ctaLabel: 'Ver estudo',
        footer: 'Este é um alerta automático do SmartPACS.',
      }),
    });
  }

  private emailTemplate({
    title,
    greeting,
    body,
    ctaUrl,
    ctaLabel,
    footer,
  }: {
    title: string;
    greeting: string;
    body: string;
    ctaUrl: string;
    ctaLabel: string;
    footer?: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1e293b;padding:28px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#3b82f6;border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                  <span style="color:white;font-size:18px;font-weight:bold;">D</span>
                </td>
                <td style="padding-left:12px;">
                  <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">SmartPACS</div>
                  <div style="color:#94a3b8;font-size:11px;margin-top:2px;">Medical Imaging Platform</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px 28px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">${title}</h1>
            <p style="margin:0 0 20px;font-size:15px;color:#334155;">${greeting}</p>
            <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">${body}</p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#1e293b;border-radius:8px;">
                  <a href="${ctaUrl}"
                     style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
            </table>

            <!-- Fallback link -->
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
              Se o botão não funcionar, copie e cole o link abaixo no navegador:
            </p>
            <p style="margin:0;font-size:12px;color:#3b82f6;word-break:break-all;">
              <a href="${ctaUrl}" style="color:#3b82f6;">${ctaUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              ${footer || 'Este email foi enviado automaticamente pelo SmartPACS. Por favor, não responda.'}
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;">
              © ${new Date().getFullYear()} SmartPACS · LGPD/HIPAA Compliant
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  async directSend(options: SendEmailOptions): Promise<void> {
    const from = this.configService.get<string>('email.from', 'SmartPACS <noreply@smartpacs.com>');
    try {
      await this.transporter.sendMail({
        from,
        to: Array.isArray(options.to) ? options.to.join(',') : options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent to: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${(error as Error).message}`);
      // In dev, log the content so it's always accessible even if SMTP fails
      if (this.configService.get('app.nodeEnv') !== 'production') {
        this.logger.warn(
          `[DEV FALLBACK] Subject: ${options.subject} | ` +
          `Body: ${options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200)}`,
        );
      }
    }
  }
}
