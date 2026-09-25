import type { ProviderCheckResult } from '../provider-check';
import type { StatusReporter } from '../provider-status';

export interface MailMessage {
  to: string | string[];
  subject: string;
  /** Plain-text body (always required: accessible and spam-filter friendly). */
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Logical type for logs/metrics, e.g. "auth.verify_email". Never contains data. */
  tag?: string;
  /** Same as `tag`, as a list (accepted for callers that send several). */
  tags?: string[];
}

export interface MailSendResult {
  driver: 'console' | 'smtp';
  messageId: string;
  /**
   * true only when an SMTP server accepted the message. The console driver
   * returns false: the message was only written to the log.
   */
  delivered: boolean;
}

/**
 * Inject with `@Inject(MAIL_SENDER) mail: MailSender`.
 * `send()` throws AppException 503 INTEGRATION_NOT_CONFIGURED when the SMTP
 * driver is selected but not configured, and 502 UPSTREAM_ERROR when the
 * SMTP server rejects the message.
 */
export interface MailSender extends StatusReporter {
  readonly driver: 'console' | 'smtp';
  send(message: MailMessage): Promise<MailSendResult>;
  /** Connectivity/authentication check (SMTP: EHLO + AUTH without sending). */
  check(): Promise<ProviderCheckResult>;
}

/** Captured message of the console driver (development/test only). */
export interface CapturedMail extends MailMessage {
  messageId: string;
  sentAt: string;
}
