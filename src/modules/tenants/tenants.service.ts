import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options?: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = options?.search
      ? { name: { contains: options.search, mode: 'insensitive' as const } }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenants.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              branches: true,
            },
          },
          subscriptions: {
            include: {
              plan: true,
            },
          },
        },
      }),
      this.prisma.tenants.count({ where }),
    ]);

    return {
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        userCount: t._count.users,
        branchCount: t._count.branches,
        subscription: t.subscriptions
          ? {
              id: t.subscriptions.id,
              status: t.subscriptions.status,
              currentPeriodEnd: t.subscriptions.current_period_end,
              plan: t.subscriptions.plan
                ? {
                    id: t.subscriptions.plan.id,
                    name: t.subscriptions.plan.name,
                    priceMonthly: t.subscriptions.plan.price_monthly,
                    maxBranches: t.subscriptions.plan.max_branches,
                    maxUsers: t.subscriptions.plan.max_users,
                  }
                : null,
            }
          : null,
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
    const tenant = await this.prisma.tenants.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            branches: true,
            customers: true,
            transactions: true,
          },
        },
        subscriptions: {
          include: { plan: true },
        },
        users: {
          select: {
            id: true,
            email: true,
            full_name: true,
            role: true,
            account_status: true,
            created_at: true,
          },
          take: 50,
          orderBy: { created_at: 'desc' },
        },
        branches: {
          select: {
            id: true,
            name: true,
            branch_code: true,
            location: true,
            status: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      counts: {
        users: tenant._count.users,
        branches: tenant._count.branches,
        customers: tenant._count.customers,
        transactions: tenant._count.transactions,
      },
      subscription: tenant.subscriptions
        ? {
            id: tenant.subscriptions.id,
            status: tenant.subscriptions.status,
            currentPeriodEnd: tenant.subscriptions.current_period_end,
            stripeCustomerId: tenant.subscriptions.stripe_customer_id,
            stripeSubscriptionId: tenant.subscriptions.stripe_subscription_id,
            plan: tenant.subscriptions.plan
              ? {
                  id: tenant.subscriptions.plan.id,
                  name: tenant.subscriptions.plan.name,
                  priceMonthly: tenant.subscriptions.plan.price_monthly,
                  maxBranches: tenant.subscriptions.plan.max_branches,
                  maxUsers: tenant.subscriptions.plan.max_users,
                }
              : null,
          }
        : null,
      users: tenant.users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        accountStatus: u.account_status,
        createdAt: u.created_at,
      })),
      branches: tenant.branches.map((b) => ({
        id: b.id,
        name: b.name,
        branchCode: b.branch_code,
        location: b.location,
        status: b.status,
        createdAt: b.created_at,
      })),
    };
  }

  async create(name: string) {
    const tenant = await this.prisma.tenants.create({
      data: { name },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.created_at,
    };
  }

  async update(id: string, name: string) {
    const tenant = await this.prisma.tenants.update({
      where: { id },
      data: { name, updated_at: new Date() },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      updatedAt: tenant.updated_at,
    };
  }

  async remove(id: string) {
    await this.prisma.tenants.delete({ where: { id } });
    return { success: true };
  }
}
