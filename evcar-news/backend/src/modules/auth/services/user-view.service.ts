import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';

/** The `user` object of contract §4.4.1. */
export interface UserView {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  locale: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
}

export const USER_VIEW_SELECT = {
  id: true,
  email: true,
  displayName: true,
  locale: true,
  emailVerifiedAt: true,
  createdAt: true,
  roles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

export type UserViewRow = Prisma.UserGetPayload<{ select: typeof USER_VIEW_SELECT }>;

/** Builds the contract `user` object (roles + effective permissions). */
@Injectable()
export class UserViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async fromRow(row: UserViewRow): Promise<UserView> {
    const roles = row.roles.map((r) => r.role.key).sort();
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      emailVerified: row.emailVerifiedAt !== null,
      locale: row.locale,
      roles,
      permissions: await this.rbac.permissionsForRoles(roles),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async load(userId: string): Promise<UserView | undefined> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_VIEW_SELECT,
    });
    return row ? this.fromRow(row) : undefined;
  }
}
