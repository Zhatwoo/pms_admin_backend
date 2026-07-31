import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d));
  }
  return months;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGrowth() {
    const months = buildLastNMonths(6);
    const rangeStart = new Date(`${months[0]}-01T00:00:00.000Z`);

    const [tenants, subscriptions] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.subscription.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
    ]);

    const tenantSignups = new Map(months.map((m) => [m, 0]));
    for (const t of tenants) {
      const key = monthKey(t.createdAt);
      if (tenantSignups.has(key)) {
        tenantSignups.set(key, tenantSignups.get(key)! + 1);
      }
    }

    const newSubscriptions = new Map(months.map((m) => [m, 0]));
    for (const s of subscriptions) {
      const key = monthKey(s.createdAt);
      if (newSubscriptions.has(key)) {
        newSubscriptions.set(key, newSubscriptions.get(key)! + 1);
      }
    }

    return {
      tenantSignups: months.map((month) => ({
        month,
        count: tenantSignups.get(month) ?? 0,
      })),
      newSubscriptions: months.map((month) => ({
        month,
        count: newSubscriptions.get(month) ?? 0,
      })),
    };
  }
}
