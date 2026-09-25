import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import type { MailSender } from '../../../providers/mail/mail.types';
import { MAIL_SENDER } from '../../../providers/provider-tokens';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Machine-readable template id, e.g. "auth.verify_email". */
  template: string;
}

type Lang = 'ar' | 'en';

function langOf(locale: string | null | undefined): Lang {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'ar';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface MailBody {
  lang?: Lang;
  subject: string;
  greeting: string;
  paragraphs: string[];
  link?: { url: string; label: string };
  code?: { label: string; value: string };
  footer: string;
}

const APP_NAME = 'EV Car News';

/**
 * Auth e-mails never contain user-supplied text (such as the display name):
 * anyone can register ANY address with any name, so a name would let them
 * put their own text (e.g. a phishing link) into a mail sent by the platform.
 */
const GREETING = { ar: 'مرحبًا،', en: 'Hello,' } as const;

/**
 * Composes the auth e-mails (verification, password reset, existing
 * account notice, password changed) in the recipient's language and hands
 * them to the mail adapter (MAIL_SENDER: console in dev, SMTP when
 * configured). Delivery is asynchronous: callers never wait for SMTP (keeps
 * responses fast and avoids timing side channels); failures are logged.
 */
@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  constructor(
    private readonly config: AppConfig,
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
  ) {}

  sendVerification(to: string, locale: string, token: string): void {
    const lang = langOf(locale);
    const url = `${this.webBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    const hours = Math.round(this.config.auth.emailTokenTtlMinutes / 60);
    const body: MailBody =
      lang === 'ar'
        ? {
            subject: `تأكيد بريدك الإلكتروني في ${APP_NAME}`,
            greeting: GREETING.ar,
            paragraphs: [
              `شكرًا لتسجيلك في ${APP_NAME}. اضغط الرابط التالي لتأكيد بريدك الإلكتروني.`,
              `ينتهي الرابط خلال ${hours} ساعة ويمكن استخدامه مرة واحدة فقط.`,
            ],
            link: { url, label: 'تأكيد البريد الإلكتروني' },
            code: { label: 'أو أدخل هذا الرمز في التطبيق:', value: token },
            footer: 'إذا لم تنشئ هذا الحساب فتجاهل هذه الرسالة.',
          }
        : {
            subject: `Verify your email for ${APP_NAME}`,
            greeting: GREETING.en,
            paragraphs: [
              `Thanks for signing up to ${APP_NAME}. Open the link below to verify your email address.`,
              `The link expires in ${hours} hours and can be used once.`,
            ],
            link: { url, label: 'Verify email' },
            code: { label: 'Or enter this code in the app:', value: token },
            footer: "If you didn't create this account, ignore this email.",
          };
    this.dispatch(to, 'auth.verify_email', body, lang);
  }

  sendPasswordReset(to: string, locale: string, token: string, target: 'web' | 'app'): void {
    const lang = langOf(locale);
    const base = target === 'web' ? this.config.http.adminBaseUrl : this.webBaseUrl();
    const url = `${base.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    const minutes = this.config.auth.passwordResetTtlMinutes;
    const body: MailBody =
      lang === 'ar'
        ? {
            subject: `إعادة تعيين كلمة المرور في ${APP_NAME}`,
            greeting: GREETING.ar,
            paragraphs: [
              'تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك. اضغط الرابط التالي لاختيار كلمة مرور جديدة.',
              `ينتهي الرابط خلال ${minutes} دقيقة ويمكن استخدامه مرة واحدة فقط. سيتم تسجيل خروجك من كل الأجهزة.`,
            ],
            link: { url, label: 'إعادة تعيين كلمة المرور' },
            code: { label: 'أو أدخل هذا الرمز في التطبيق:', value: token },
            footer: 'إذا لم تطلب ذلك فتجاهل هذه الرسالة؛ لن تتغير كلمة المرور.',
          }
        : {
            subject: `Reset your ${APP_NAME} password`,
            greeting: GREETING.en,
            paragraphs: [
              'We received a request to reset the password of your account. Open the link below to choose a new password.',
              `The link expires in ${minutes} minutes and can be used once. You will be signed out on all devices.`,
            ],
            link: { url, label: 'Reset password' },
            code: { label: 'Or enter this code in the app:', value: token },
            footer: "If you didn't request this, ignore this email; your password will not change.",
          };
    this.dispatch(to, 'auth.reset_password', body, lang);
  }

  /** Sent when someone tries to register with an address that already has an account. */
  sendAccountExists(to: string, locale: string): void {
    const lang = langOf(locale);
    const body: MailBody =
      lang === 'ar'
        ? {
            subject: `محاولة تسجيل ببريدك في ${APP_NAME}`,
            greeting: GREETING.ar,
            paragraphs: [
              'حاول أحدهم إنشاء حساب جديد بهذا البريد الإلكتروني، لكن لديك حسابًا بالفعل.',
              'إذا كنت أنت، فسجّل الدخول، أو استخدم «نسيت كلمة المرور» إذا لم تتذكرها.',
            ],
            footer: 'إذا لم تكن أنت فلا حاجة لأي إجراء؛ لم يتغير شيء في حسابك.',
          }
        : {
            subject: `Sign-up attempt with your email on ${APP_NAME}`,
            greeting: GREETING.en,
            paragraphs: [
              'Someone tried to create a new account with this email address, but you already have one.',
              'If this was you, sign in instead, or use "Forgot password" if you do not remember it.',
            ],
            footer: "If this wasn't you, no action is needed; nothing changed in your account.",
          };
    this.dispatch(to, 'auth.account_exists', body, lang);
  }

  sendPasswordChanged(to: string, locale: string): void {
    const lang = langOf(locale);
    const body: MailBody =
      lang === 'ar'
        ? {
            subject: `تم تغيير كلمة المرور في ${APP_NAME}`,
            greeting: GREETING.ar,
            paragraphs: [
              'تم تغيير كلمة مرور حسابك، وتم تسجيل الخروج من جميع الأجهزة.',
              'إذا لم تقم بذلك فاطلب إعادة تعيين كلمة المرور فورًا وتواصل معنا.',
            ],
            footer: APP_NAME,
          }
        : {
            subject: `Your ${APP_NAME} password was changed`,
            greeting: GREETING.en,
            paragraphs: [
              'The password of your account was changed and all devices were signed out.',
              "If you didn't do this, reset your password immediately and contact us.",
            ],
            footer: APP_NAME,
          };
    this.dispatch(to, 'auth.password_changed', body, lang);
  }

  /**
   * Hands a message to the mail adapter. Public so tests can observe
   * outgoing mail (jest.spyOn); never throws.
   */
  async sendNow(mail: OutgoingMail): Promise<void> {
    try {
      await this.sender.send({
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tag: mail.template,
      });
    } catch (err) {
      // Never log the body: it contains one-time tokens.
      this.logger.error(
        `Failed to send ${mail.template} e-mail: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private dispatch(to: string, template: string, body: MailBody, lang: Lang): void {
    const mail = { to, template, subject: body.subject, ...render({ ...body, lang }) };
    void this.sendNow(mail);
  }

  /**
   * Base URL of verification / reset links (app links): SHARE_BASE_URL from
   * the environment. Deliberately NOT the admin-editable `share.baseUrl`
   * setting: whoever controls this URL receives one-time tokens, so it must
   * not be changeable by anyone below the operator (e.g. an admin trying to
   * capture an owner's reset link).
   */
  private webBaseUrl(): string {
    return this.config.http.shareBaseUrl.replace(/\/+$/, '');
  }
}

function render(body: MailBody): { text: string; html: string } {
  const text = [
    body.greeting,
    '',
    ...body.paragraphs.flatMap((p) => [p, '']),
    ...(body.link ? [`${body.link.label}: ${body.link.url}`, ''] : []),
    ...(body.code ? [body.code.label, body.code.value, ''] : []),
    body.footer,
  ].join('\n');
  const html = [
    `<!doctype html><html lang="${body.lang ?? 'ar'}" dir="${body.lang === 'en' ? 'ltr' : 'rtl'}"><body style="font-family:Arial,sans-serif;line-height:1.6">`,
    `<p>${escapeHtml(body.greeting)}</p>`,
    ...body.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    body.link
      ? `<p><a href="${escapeHtml(body.link.url)}" style="background:#0A5CFF;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(body.link.label)}</a></p>`
      : '',
    body.code
      ? `<p>${escapeHtml(body.code.label)}<br><code style="font-size:13px;word-break:break-all">${escapeHtml(body.code.value)}</code></p>`
      : '',
    `<p style="color:#666;font-size:12px">${escapeHtml(body.footer)}</p>`,
    '</body></html>',
  ].join('');
  return { text, html };
}
