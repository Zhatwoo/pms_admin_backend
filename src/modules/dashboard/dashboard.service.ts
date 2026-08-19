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
        by: ['planVersionId'],
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
            include: { planVersion: { include: { plan: true } } },
          },
        },
      }),
    ]);

    const planVersions = await this.prisma.subscriptionPlanVersion.findMany({
      where: { id: { in: subscriptionsByPlanRaw.map((s) => s.planVersionId) } },
      include: { plan: true },
    });
    const planNameByVersionId = new Map(
      planVersions.map((pv) => [pv.id, pv.plan.name]),
    );

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
        planName: planNameByVersionId.get(row.planVersionId) ?? 'Unknown',
        count: row._count._all,
      })),
      recentTenants: recentTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt.toISOString(),
        userCount: tenant.users.length,
        branchCount: tenant.branches.length,
        subscriptionPlan:
          tenant.subscriptions[0]?.planVersion?.plan?.name ?? null,
        subscriptionStatus: tenant.subscriptions[0]?.status ?? null,
      })),
    };
  }
}
