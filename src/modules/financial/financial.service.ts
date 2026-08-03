import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async getRevenueReport() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'paid' },
      include: { subscription: { include: { plan: true, tenant: true } } },
    });

    const byMonth = new Map<string, number>();
    const byPlan = new Map<string, number>();
    const byTenant = new Map<string, number>();

    for (const invoice of invoices) {
      const monthKey = invoice.periodStart.toISOString().slice(0, 7);
      const amount = Number(invoice.amount);

      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + amount);

      const planName = invoice.subscription.plan.name;
      byPlan.set(planName, (byPlan.get(planName) ?? 0) + amount);

      const tenantName = invoice.subscription.tenant.name;
      byTenant.set(tenantName, (byTenant.get(tenantName) ?? 0) + amount);
    }

    return {
      byMonth: Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total })),
      byPlan: Array.from(byPlan.entries()).map(([planName, total]) => ({
        planName,
        total,
      })),
      topTenants: Array.from(byTenant.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tenantName, total]) => ({ tenantName, total })),
    };
  }
}
