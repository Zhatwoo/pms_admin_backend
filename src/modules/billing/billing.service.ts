import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUser } from '../../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { subscription: { include: { tenant: true, plan: true } } },
      }),
      this.prisma.invoice.count(),
    ]);

    return {
      data: data.map((invoice) => ({
        id: invoice.id,
        tenant: invoice.subscription.tenant.name,
        plan: invoice.subscription.plan.name,
        amount: invoice.amount,
        status: invoice.status,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        createdAt: invoice.createdAt,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Generates one pending invoice per active subscription for the current period, skipping ones already generated. */
  async generateForActiveSubscriptions(actor: AdminUser) {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: 'active' },
      include: { plan: true },
    });

    const created: string[] = [];

    for (const sub of activeSubscriptions) {
      const existing = await this.prisma.invoice.findFirst({
        where: { subscriptionId: sub.id, periodStart },
      });
      if (existing) continue;

      const invoice = await this.prisma.invoice.create({
        data: {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          amount: sub.plan.priceMonthly,
          status: 'pending',
          periodStart,
          periodEnd,
        },
      });
      created.push(invoice.id);
    }

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'invoice_batch',
      metadata: { count: created.length, periodStart },
    });

    return { generated: created.length };
  }

  async markPaid(id: string, actor: AdminUser) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${id} not found`);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'paid' },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'invoice',
      resourceId: id,
      metadata: { status: 'paid' },
    });

    return updated;
  }

  async getSummary() {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [mrrAgg, outstandingAgg, paidThisMonthAgg] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: 'active' },
        include: { plan: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'paid', createdAt: { gte: periodStart } },
        _sum: { amount: true },
      }),
    ]);

    const mrr = mrrAgg.reduce(
      (sum, sub) => sum + Number(sub.plan.priceMonthly),
      0,
    );

    return {
      monthlyRecurringRevenue: mrr,
      outstandingInvoices: Number(outstandingAgg._sum.amount ?? 0),
      collectedThisMonth: Number(paidThisMonthAgg._sum.amount ?? 0),
    };
  }
}
