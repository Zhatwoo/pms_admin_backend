import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalTenants,
      totalUsers,
      totalBranches,
      totalCustomers,
      totalTransactions,
      activeSubscriptions,
      subscriptionsByPlanRaw,
      recentTenants,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenantUser.count(),
      this.prisma.branch.count(),
      this.prisma.customer.count(),
      this.prisma.transaction.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        _count: { _all: true },
      }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          branches: { select: { id: true } },
          users: { select: { id: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      }),
    ]);

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { id: { in: subscriptionsByPlanRaw.map((s) => s.planId) } },
    });
    const planNameById = new Map(plans.map((p) => [p.id, p.name]));

    return {
      overview: {
        totalTenants,
        totalUsers,
        totalBranches,
        totalCustomers,
        totalTransactions,
        activeSubscriptions,
      },
      subscriptionsByPlan: subscriptionsByPlanRaw.map((row) => ({
        planName: planNameById.get(row.planId) ?? 'Unknown',
        count: row._count._all,
      })),
      recentTenants: recentTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt.toISOString(),
        userCount: tenant.users.length,
        branchCount: tenant.branches.length,
        subscriptionPlan: tenant.subscriptions[0]?.plan.name ?? null,
        subscriptionStatus: tenant.subscriptions[0]?.status ?? null,
      })),
    };
  }
}
