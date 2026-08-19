import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminUserStatus } from '../../../generated/prisma/enums';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.admin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const adminUser = await this.prisma.adminUser.findUnique({
      where: { authId: data.user.id },
    });

    if (!adminUser) {
      throw new UnauthorizedException('This account is not an admin user');
    }

    if (adminUser.status !== AdminUserStatus.active) {
      throw new UnauthorizedException('This account is not active');
    }

    await this.prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditLogs.record({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      action: 'login',
      resourceType: 'admin_user',
      resourceId: adminUser.id,
    });

    return {
      adminUser,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    };
  }

  async getProfileFromAccessToken(accessToken: string) {
    const { data, error } = await this.supabase.admin.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Session expired');
    }

    const adminUser = await this.prisma.adminUser.findUnique({
      where: { authId: data.user.id },
    });

    if (!adminUser || adminUser.status !== AdminUserStatus.active) {
      throw new UnauthorizedException('Session expired');
    }

    return adminUser;
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await this.supabase.admin.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Session expired');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    };
  }

  async logout(accessToken: string | undefined) {
    if (!accessToken) return;

    const adminUser = await this.getProfileFromAccessToken(accessToken).catch(
      () => null,
    );

    await this.supabase.admin.auth.admin.signOut(accessToken).catch(() => {});

    if (adminUser) {
      await this.auditLogs.record({
        actorId: adminUser.id,
        actorEmail: adminUser.email,
        action: 'logout',
        resourceType: 'admin_user',
        resourceId: adminUser.id,
      });
    }
  }

  toPublicUser(adminUser: {
    id: string;
    authId: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl: string | null;
    notificationSound: string | null;
  }) {
    return {
      id: adminUser.id,
      authId: adminUser.authId,
      email: adminUser.email,
      fullName: adminUser.fullName,
      role: adminUser.role,
      avatarUrl: adminUser.avatarUrl ?? undefined,
      notificationSound: adminUser.notificationSound ?? undefined,
    };
  }
}
