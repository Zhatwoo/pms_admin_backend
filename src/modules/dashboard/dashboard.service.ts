import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma';

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
      subscriptionsByPlan,
      recentTenants,
    ] = await Promise.all([
      this.prisma.tenants.count(),
      this.prisma.users.count(),
      this.prisma.branches.count(),
      this.prisma.customers.count(),
      this.prisma.transactions.count(),
      this.prisma.tenant_subscriptions.count({
        where: { status: 'active' },
      }),
      this.prisma.tenant_subscriptions.groupBy({
        by: ['plan_id'],
        _count: { id: true },
        where: { status: 'active' },
      }),
      this.prisma.tenants.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { users: true, branches: true } },
          subscriptions: {
            include: { plan: { select: { name: true } } },
          },
        },
      }),
    ]);

    // Resolve plan names for subscriptionsByPlan
    let planBreakdown: { planName: string; count: number }[] = [];
    if (subscriptionsByPlan.length > 0) {
      const planIds = subscriptionsByPlan.map((s) => s.plan_id);
      const plans = await this.prisma.subscription_plans.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
      });
      const planMap = new Map(plans.map((p) => [p.id, p.name]));
      planBreakdown = subscriptionsByPlan.map((s) => ({
        planName: planMap.get(s.plan_id) ?? 'Unknown',
        count: s._count.id,
      }));
    }

    return {
      overview: {
        totalTenants,
        totalUsers,
        totalBranches,
        totalCustomers,
        totalTransactions,
        activeSubscriptions,
      },
      subscriptionsByPlan: planBreakdown,
      recentTenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        userCount: t._count.users,
        branchCount: t._count.branches,
        subscriptionPlan: t.subscriptions?.plan?.name ?? null,
        subscriptionStatus: t.subscriptions?.status ?? null,
      })),
    };
  }
}
