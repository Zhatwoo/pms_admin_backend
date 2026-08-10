import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUser, Prisma } from '../../../generated/prisma/client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { PmsSaasService } from '../clients/pms-saas.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly pmsSaasService: PmsSaasService,
  ) {}

  async createSubscription(dto: CreateSubscriptionDto, actor?: AdminUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!plan || plan.deletedAt || !plan.isActive) {
      throw new NotFoundException('Plan not found or is inactive');
    }

    const activeVersion = plan.versions[0];
    if (!activeVersion) {
      throw new NotFoundException('No active version found for selected plan');
    }

    const existingActive = await this.prisma.subscription.findFirst({
      where: {
        tenantId: dto.tenantId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (existingActive) {
      throw new ConflictException('Tenant already has an active subscription');
    }

    const now = new Date();
    const cycle = dto.billingCycle ?? 'monthly';
    const durationDays = cycle === 'annual' ? 365 : 30;
    const endsAt = new Date(now.getTime() + durationDays * 86400000);

    const [branchCount, userCount] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId: dto.tenantId } }),
      this.prisma.tenantUser.count({ where: { tenantId: dto.tenantId } }),
    ]);

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId: dto.tenantId,
        planVersionId: activeVersion.id,
        status: activeVersion.trialEnabled ? 'trialing' : 'active',
        billingCycle: cycle,
        autoRenew: dto.autoRenew ?? true,
        startedAt: now,
        endsAt: activeVersion.trialEnabled
          ? new Date(now.getTime() + activeVersion.trialDays * 86400000)
          : endsAt,
        branchCount,
        userCount,
        history: {
          create: {
            planVersionId: activeVersion.id,
            action: 'created',
            notes: `Subscribed to ${plan.name} (v${activeVersion.versionNumber})`,
          },
        },
      },
      include: {
        planVersion: { include: { plan: true } },
        tenant: { include: { client: true } },
      },
    });

    if (actor) {
      await this.auditLogs.record({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'create',
        resourceType: 'subscription',
        resourceId: subscription.id,
        metadata: { tenantId: dto.tenantId, planId: dto.planId, versionId: activeVersion.id },
      });
    }

    if (subscription.tenant?.subdomain) {
      const fullVersion = await this.prisma.subscriptionPlanVersion.findUnique({
        where: { id: activeVersion.id },
        include: { features: true },
      });
      await this.pmsSaasService.syncPlanRestrictions({
        subdomain: subscription.tenant.subdomain,
        contactEmail: subscription.tenant.client?.contactEmail,
        planName: plan.name,
        branchLimit: activeVersion.branchLimit,
        userLimit: activeVersion.userLimit,
        storageGb: Number(activeVersion.storageGb),
        features: fullVersion?.features.map((f) => f.name) ?? [],
        status: subscription.status,
        endsAt: subscription.endsAt,
      });
    }

    return subscription;
  }

  async findAll(query: QuerySubscriptionDto) {
    const where: Prisma.SubscriptionWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.billingCycle) {
      where.billingCycle = query.billingCycle;
    }

    if (query.trialOnly) {
      where.status = 'trialing';
    }

    if (query.expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.endsAt = {
        gte: new Date(),
        lte: thirtyDaysFromNow,
      };
    }

    if (query.planId) {
      where.planVersion = { planId: query.planId };
    }

    if (query.search) {
      where.tenant = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { subdomain: { contains: query.search, mode: 'insensitive' } },
          { client: { companyName: { contains: query.search, mode: 'insensitive' } } },
        ],
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          tenant: {
            include: {
              client: true,
              _count: { select: { branches: true, users: true } },
            },
          },
          planVersion: {
            include: { plan: true },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: data.map((sub) => ({
        id: sub.id,
        companyName: sub.tenant.client?.companyName ?? sub.tenant.name,
        tenantId: sub.tenantId,
        tenantName: sub.tenant.name,
        subdomain: sub.tenant.subdomain,
        planName: sub.planVersion.plan.name,
        planVersionNumber: sub.planVersion.versionNumber,
        planId: sub.planVersion.plan.id,
        billingCycle: sub.billingCycle,
        monthlyPrice: Number(sub.planVersion.monthlyPrice),
        annualPrice: Number(sub.planVersion.annualPrice),
        status: sub.status,
        branchCount: sub.tenant._count.branches,
        branchLimit: sub.planVersion.branchLimit,
        userCount: sub.tenant._count.users,
        userLimit: sub.planVersion.userLimit,
        storageUsedGb: Number(sub.storageUsedGb),
        storageLimitGb: Number(sub.planVersion.storageGb),
        startedAt: sub.startedAt,
        endsAt: sub.endsAt,
        lastPaymentAt: sub.lastPaymentAt,
        autoRenew: sub.autoRenew,
        createdAt: sub.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        tenant: {
          include: {
            client: true,
            branches: true,
            users: true,
            _count: { select: { branches: true, users: true, customers: true } },
          },
        },
        planVersion: {
          include: {
            plan: true,
            features: { orderBy: { displayOrder: 'asc' } },
            inclusions: { orderBy: { displayOrder: 'asc' } },
            addons: { orderBy: { displayOrder: 'asc' } },
          },
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        history: {
          orderBy: { createdAt: 'desc' },
          include: { planVersion: { include: { plan: true } } },
        },
      },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    return {
      id: sub.id,
      tenant: {
        id: sub.tenant.id,
        name: sub.tenant.name,
        subdomain: sub.tenant.subdomain,
        companyName: sub.tenant.client?.companyName ?? sub.tenant.name,
        contactName: sub.tenant.client?.contactName ?? null,
        contactEmail: sub.tenant.client?.contactEmail ?? null,
        contactPhone: sub.tenant.client?.contactPhone ?? null,
      },
      plan: {
        id: sub.planVersion.plan.id,
        name: sub.planVersion.plan.name,
        versionNumber: sub.planVersion.versionNumber,
        monthlyPrice: Number(sub.planVersion.monthlyPrice),
        annualPrice: Number(sub.planVersion.annualPrice),
        currency: sub.planVersion.currency,
        features: sub.planVersion.features,
        inclusions: sub.planVersion.inclusions,
        addons: sub.planVersion.addons.map((a) => ({ ...a, price: Number(a.price) })),
      },
      status: sub.status,
      billingCycle: sub.billingCycle,
      autoRenew: sub.autoRenew,
      startedAt: sub.startedAt,
      endsAt: sub.endsAt,
      lastPaymentAt: sub.lastPaymentAt,
      usage: {
        branches: { current: sub.tenant._count.branches, limit: sub.planVersion.branchLimit },
        users: { current: sub.tenant._count.users, limit: sub.planVersion.userLimit },
        storage: { currentGb: Number(sub.storageUsedGb), limitGb: Number(sub.planVersion.storageGb) },
      },
      invoices: sub.invoices.map((inv) => ({
        id: inv.id,
        amount: Number(inv.amount),
        status: inv.status,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        createdAt: inv.createdAt,
      })),
      history: sub.history.map((h) => ({
        id: h.id,
        action: h.action,
        planName: h.planVersion.plan.name,
        versionNumber: h.planVersion.versionNumber,
        notes: h.notes,
        createdAt: h.createdAt,
      })),
    };
  }

  async update(id: string, dto: UpdateSubscriptionDto, actor: AdminUser) {
    const existing = await this.prisma.subscription.findUnique({
      where: { id },
      include: { planVersion: { include: { plan: true } } },
    });
    if (!existing) throw new NotFoundException(`Subscription ${id} not found`);

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: dto,
      include: { planVersion: { include: { plan: true } }, tenant: true },
    });

    if (dto.status && dto.status !== existing.status) {
      await this.prisma.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          planVersionId: existing.planVersionId,
          action: `status_changed_to_${dto.status}`,
          notes: `Status updated from ${existing.status} to ${dto.status}`,
        },
      });
    }

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'subscription',
      resourceId: id,
      metadata: dto,
    });

    return updated;
  }

  async changePlan(id: string, dto: ChangePlanDto, actor: AdminUser) {
    const currentSub = await this.prisma.subscription.findUnique({
      where: { id },
      include: { planVersion: { include: { plan: true } } },
    });
    if (!currentSub) throw new NotFoundException(`Subscription ${id} not found`);

    const newPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.newPlanId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!newPlan || newPlan.deletedAt || !newPlan.isActive) {
      throw new NotFoundException('Target plan not found or is inactive');
    }

    const newActiveVer = newPlan.versions[0];
    if (!newActiveVer) {
      throw new NotFoundException('Target plan has no active version');
    }

    const isUpgrade = Number(newActiveVer.monthlyPrice) >= Number(currentSub.planVersion.monthlyPrice);
    const actionName = isUpgrade ? 'upgraded' : 'downgraded';

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        planVersionId: newActiveVer.id,
        billingCycle: dto.billingCycle ?? currentSub.billingCycle,
        status: 'active',
        history: {
          create: {
            planVersionId: newActiveVer.id,
            action: actionName,
            notes: dto.notes ?? `${actionName.toUpperCase()} from ${currentSub.planVersion.plan.name} (v${currentSub.planVersion.versionNumber}) to ${newPlan.name} (v${newActiveVer.versionNumber})`,
          },
        },
      },
      include: { planVersion: { include: { plan: true } }, tenant: true },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'subscription',
      resourceId: id,
      metadata: { action: actionName, fromPlan: currentSub.planVersion.plan.name, toPlan: newPlan.name },
    });

    const fullNewVer = await this.prisma.subscriptionPlanVersion.findUnique({
      where: { id: newActiveVer.id },
      include: { features: true },
    });

    const tenantWithClient = await this.prisma.tenant.findUnique({
      where: { id: updated.tenantId },
      include: { client: true },
    });

    if (tenantWithClient?.subdomain) {
      await this.pmsSaasService.syncPlanRestrictions({
        subdomain: tenantWithClient.subdomain,
        contactEmail: tenantWithClient.client?.contactEmail,
        planName: newPlan.name,
        branchLimit: newActiveVer.branchLimit,
        userLimit: newActiveVer.userLimit,
        storageGb: Number(newActiveVer.storageGb),
        features: fullNewVer?.features.map((f) => f.name) ?? [],
        status: updated.status,
        endsAt: updated.endsAt,
      });
    }

    return updated;
  }

  async renew(id: string, actor: AdminUser) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: { planVersion: { include: { plan: true } } },
    });
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);

    const now = new Date();
    const baseDate = sub.endsAt && sub.endsAt > now ? sub.endsAt : now;
    const newEndsAt = new Date(baseDate);

    if (sub.billingCycle === 'annual') {
      newEndsAt.setFullYear(newEndsAt.getFullYear() + 1);
    } else {
      newEndsAt.setMonth(newEndsAt.getMonth() + 1);
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        status: 'active',
        endsAt: newEndsAt,
        lastPaymentAt: now,
        history: {
          create: {
            planVersionId: sub.planVersionId,
            action: 'renewed',
            notes: `Renewed ${sub.billingCycle} subscription until ${newEndsAt.toISOString().split('T')[0]}`,
          },
        },
      },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'subscription',
      resourceId: id,
      metadata: { action: 'renewed', newEndsAt },
    });

    return updated;
  }

  async suspend(id: string, actor: AdminUser) {
    return this.update(id, { status: 'suspended' }, actor);
  }

  async cancel(id: string, actor: AdminUser) {
    return this.update(id, { status: 'canceled' }, actor);
  }

  async getSummary() {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [
      activeSubs,
      activeSubCount,
      trialUsersCount,
      expiredCount,
      upcomingRenewalsCount,
      paidInvoices,
      popularPlanGroup,
    ] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { status: 'active' },
        include: { planVersion: true },
      }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({ where: { status: 'trialing' } }),
      this.prisma.subscription.count({ where: { status: { in: ['expired', 'canceled'] } } }),
      this.prisma.subscription.count({
        where: {
          status: 'active',
          endsAt: { gte: now, lte: thirtyDaysFromNow },
        },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
      }),
      this.prisma.subscriptionPlan.findFirst({
        where: { isPopular: true, isActive: true },
        select: { name: true },
      }),
    ]);

    const totalRevenue = Number(paidInvoices._sum.amount ?? 0);

    const monthlyRecurringRevenue = activeSubs.reduce((acc, sub) => {
      const monthly = Number(sub.planVersion.monthlyPrice);
      const annual = Number(sub.planVersion.annualPrice);
      if (sub.billingCycle === 'annual') {
        return acc + annual / 12;
      }
      return acc + monthly;
    }, 0);

    return {
      totalRevenue,
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue),
      activeSubscribers: activeSubCount,
      trialUsers: trialUsersCount,
      expired: expiredCount,
      mostPopularPlan: popularPlanGroup?.name ?? 'Standard',
      upcomingRenewals: upcomingRenewalsCount,
    };
  }
}
