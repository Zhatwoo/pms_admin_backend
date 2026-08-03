import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUser, InvoiceStatus, Prisma } from '../../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query: PaginationDto & { status?: string; tenantId?: string }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.status) {
      where.status = query.status as InvoiceStatus;
    }
    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          subscription: { include: { tenant: { include: { client: true } }, plan: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((invoice) => ({
        id: invoice.id,
        tenantId: invoice.tenantId,
        tenant: invoice.subscription.tenant.name,
        companyName: invoice.subscription.tenant.client?.companyName ?? null,
        contactEmail: invoice.subscription.tenant.client?.contactEmail ?? null,
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

  async createInvoice(dto: CreateInvoiceDto, actor: AdminUser) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: dto.subscriptionId },
      include: { tenant: true, plan: true },
    });
    if (!sub) {
      throw new NotFoundException(`Subscription with id ${dto.subscriptionId} not found`);
    }

    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const invoice = await this.prisma.invoice.create({
      data: {
        subscriptionId: sub.id,
        tenantId: sub.tenantId,
        amount: dto.amount,
        status: dto.status ?? 'pending',
        periodStart,
        periodEnd,
      },
      include: { subscription: { include: { tenant: true, plan: true } } },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'invoice',
      resourceId: invoice.id,
      metadata: { tenantId: sub.tenantId, amount: dto.amount },
    });

    return invoice;
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
