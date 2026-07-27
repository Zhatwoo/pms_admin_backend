import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma';
import type { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    tenantId?: string;
    status?: string;
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.usersWhereInput = {};

    if (options?.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { full_name: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    if (options?.role) {
      where.role = options.role;
    }

    if (options?.tenantId) {
      where.tenant_id = options.tenantId;
    }

    if (options?.status) {
      where.account_status = options.status;
    }

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          full_name: true,
          role: true,
          branch_id: true,
          account_status: true,
          created_at: true,
          updated_at: true,
          avatar_url: true,
          tenant_id: true,
          branches: { select: { name: true } },
          tenant: { select: { name: true } },
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        branchId: u.branch_id,
        branchName: u.branches?.name ?? null,
        accountStatus: u.account_status,
        avatarUrl: u.avatar_url,
        tenantId: u.tenant_id,
        tenantName: u.tenant?.name ?? null,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        auth_id: true,
        email: true,
        full_name: true,
        role: true,
        branch_id: true,
        account_status: true,
        created_at: true,
        updated_at: true,
        avatar_url: true,
        notification_sound: true,
        tenant_id: true,
        is_developer: true,
        branches: { select: { id: true, name: true, branch_code: true } },
        tenant: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      authId: user.auth_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id,
      branch: user.branches
        ? {
            id: user.branches.id,
            name: user.branches.name,
            branchCode: user.branches.branch_code,
          }
        : null,
      accountStatus: user.account_status,
      avatarUrl: user.avatar_url,
      notificationSound: user.notification_sound,
      tenantId: user.tenant_id,
      tenant: user.tenant
        ? { id: user.tenant.id, name: user.tenant.name }
        : null,
      isDeveloper: user.is_developer,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }
}
