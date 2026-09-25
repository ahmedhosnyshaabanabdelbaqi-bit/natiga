import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { upstreamException } from '../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../provider-check';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import type { MailMessage, MailSender, MailSendResult } from './mail.types';

/** SMTP driver (nodemailer). Not configured until SMTP_HOST is set. */
export class SmtpMailSender implements MailSender {
  readonly driver = 'smtp' as const;
  private readonly logger = new Logger('Mail');
  private readonly activity = new ProviderActivity();
  private readonly transport?: Transporter;

  constructor(
    private readonly config: AppConfig,
    transport?: Transporter,
  ) {
    const smtp = config.mail.smtp;
    if (smtp.host) {
      this.transport =
        transport ??
        createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
          // Plain-text SMTP is only tolerated outside production (e.g. mailpit).
          requireTLS: config.isProduction && !smtp.secure,
        });
    }
  }

  status(): ProviderStatus {
    if (!this.transport) {
      return {
        type: 'mail',
        name: 'smtp',
        configured: false,
        reason: 'SMTP_HOST is not set.',
        ...this.activity.snapshot(),
      };
    }
    const notes: string[] = [];
    if (!this.config.mail.smtp.secure && this.config.isProduction) {
      notes.push('STARTTLS is required in production (SMTP_SECURE=false).');
    }
    return { type: 'mail', name: 'smtp', configured: true, notes, ...this.activity.snapshot() };
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    if (!this.transport) throw AppException.integrationNotConfigured('mail.smtp');
    try {
      const info = (await this.transport.sendMail({
        from: this.config.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
        headers: message.headers,
      })) as { messageId?: string; accepted?: unknown[]; rejected?: unknown[] };
      const accepted = info.accepted?.length ?? 0;
      if (accepted === 0) throw new Error('No recipient was accepted by the SMTP server');
      this.activity.success();
      return { driver: 'smtp', messageId: info.messageId ?? '', delivered: true };
    } catch (err) {
      this.activity.failure(err);
      this.logger.warn(
        { tag: message.tag ?? message.tags?.join(','), err: (err as Error).message },
        'SMTP send failed',
      );
      throw upstreamException('mail.smtp', err);
    }
  }

  async check(): Promise<ProviderCheckResult> {
    const transport = this.transport;
    if (!transport) return NOT_CONFIGURED_CHECK;
    const result = await timedCheck(() => transport.verify());
    if (result.ok) this.activity.success();
    else this.activity.failure(new Error(result.error));
    return result;
  }
}
