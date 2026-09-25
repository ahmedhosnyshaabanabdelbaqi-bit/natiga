import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/**
 * User accounts: /me (profile, sessions, password change, account
 * deletion) and /admin/users (search, roles, suspension, sessions).
 */
@Module({
  imports: [AuthModule],
  controllers: [MeController, AdminUsersController],
  providers: [MeService, AdminUsersService],
  exports: [MeService, AdminUsersService],
})
export class UsersModule {}
