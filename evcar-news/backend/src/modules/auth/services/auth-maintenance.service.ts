import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { SessionService } from './session.service';

/** Days an ended session / used or expired e-mail token is kept before deletion. */
export const AUTH_RETENTION_DAYS = 30;

/**
 * Daily housekeeping: deletes sessions that ended (expired or revoked) and
 * e-mail tokens that were used or expired more than AUTH_RETENTION_DAYS ago.
 * Idempotent, so running it on several instances is harmless. Only
 * registered when background jobs are enabled (JOBS_ENABLED).
 */
@Injectable()
export class AuthMaintenanceService {
  private readonly logger = new Logger(AuthMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  @Cron('17 3 * * *', { name: 'auth-housekeeping' })
  async run(): Promise<{ sessions: number; emailTokens: number }> {
    const cutoff = new Date(Date.now() - AUTH_RETENTION_DAYS * 24 * 3600 * 1000);
    try {
      const sessions = await this.sessions.purgeEnded(AUTH_RETENTION_DAYS);
      const { count: emailTokens } = await this.prisma.emailToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
      });
      if (sessions + emailTokens > 0) {
        this.logger.log(`Purged ${sessions} ended sessions and ${emailTokens} e-mail tokens`);
      }
      return { sessions, emailTokens };
    } catch (err) {
      this.logger.error(`Auth housekeeping failed: ${(err as Error).message}`);
      return { sessions: 0, emailTokens: 0 };
    }
  }
}
