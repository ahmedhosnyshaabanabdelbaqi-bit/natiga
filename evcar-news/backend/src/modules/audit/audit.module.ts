import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuditController } from './admin-audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Audit log (audit_logs): automatic records of every mutating
 * /api/v1/admin request (AuditInterceptor), security events written by the
 * auth/users/rbac modules, and GET /api/v1/admin/audit-logs (audit.read).
 * Global so any module can inject AuditService.
 */
@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
