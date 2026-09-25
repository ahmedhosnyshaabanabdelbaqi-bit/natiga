import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import type { ProviderCheckResult } from '../provider-check';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import type { CapturedMail, MailMessage, MailSender, MailSendResult } from './mail.types';

const OUTBOX_LIMIT = 50;

/**
 * Development driver: e-mails are written to the log instead of being sent
 * (`delivered: false`). Outside production the full text is logged (so the
 * verification / reset links can be used locally) and the last messages are
 * kept in memory for tests (`outbox()`). In production only metadata is
 * logged — bodies may contain one-time tokens — and the status reports the
 * driver as not configured, because nobody receives these e-mails.
 */
export class ConsoleMailSender implements MailSender {
  readonly driver = 'console' as const;
  private readonly logger = new Logger('Mail');
  private readonly activity = new ProviderActivity();
  private readonly captured: CapturedMail[] = [];

  constructor(private readonly config: AppConfig) {}

  status(): ProviderStatus {
    if (this.config.isProduction) {
      return {
        type: 'mail',
        name: 'console',
        configured: false,
        reason:
          'MAIL_DRIVER=console only logs e-mails; set MAIL_DRIVER=smtp and SMTP_* to deliver them.',
        ...this.activity.snapshot(),
      };
    }
    return {
      type: 'mail',
      name: 'console',
      configured: true,
      notes: ['Development driver: e-mails are printed to the server log, not delivered.'],
      ...this.activity.snapshot(),
    };
  }

  send(message: MailMessage): Promise<MailSendResult> {
    const messageId = `<${randomUUID()}@console.evcar.local>`;
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    const tag = message.tag ?? message.tags?.join(',');
    if (this.config.isProduction) {
      this.logger.warn(
        { tag, recipients: recipients.length, messageId },
        'E-mail NOT delivered (MAIL_DRIVER=console)',
      );
    } else {
      this.logger.log(
        `\n--- e-mail (not delivered, MAIL_DRIVER=console) ---\nTo: ${recipients.join(', ')}\nSubject: ${message.subject}\nTag: ${tag ?? '-'}\n\n${message.text}\n--- end ---`,
      );
      this.captured.push({ ...message, messageId, sentAt: new Date().toISOString() });
      if (this.captured.length > OUTBOX_LIMIT) this.captured.shift();
    }
    this.activity.success();
    return Promise.resolve({ driver: 'console', messageId, delivered: false });
  }

  check(): Promise<ProviderCheckResult> {
    return Promise.resolve({ ok: true, latencyMs: 0 });
  }

  /** Messages "sent" in this process (development/test only; empty in production). */
  outbox(): readonly CapturedMail[] {
    return this.captured;
  }

  clearOutbox(): void {
    this.captured.length = 0;
  }
}
