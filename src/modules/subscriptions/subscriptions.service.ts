import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPlans() {
    const plans = await this.prisma.subscription_plans.findMany({
      orderBy: { price_monthly: 'asc' },
      include: {
        _count: {
          select: { tenant_subscriptions: true },
        },
      },
    });

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.price_monthly,
      maxBranches: p.max_branches,
      maxUsers: p.max_users,
      stripePriceId: p.stripe_price_id,
      activeSubscriptions: p._count.tenant_subscriptions,
    }));
  }

  async findAllSubscriptions() {
    const subs = await this.prisma.tenant_subscriptions.findMany({
      include: {
        tenant: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, price_monthly: true } },
      },
      orderBy: { current_period_end: 'desc' },
    });

    return subs.map((s) => ({
      id: s.id,
      tenantId: s.tenant_id,
      tenantName: s.tenant.name,
      status: s.status,
      currentPeriodEnd: s.current_period_end,
      plan: s.plan
        ? {
            id: s.plan.id,
            name: s.plan.name,
            priceMonthly: s.plan.price_monthly,
          }
        : null,
      stripeCustomerId: s.stripe_customer_id,
      stripeSubscriptionId: s.stripe_subscription_id,
    }));
  }

  async findByTenant(tenantId: string) {
    const sub = await this.prisma.tenant_subscriptions.findUnique({
      where: { tenant_id: tenantId },
      include: {
        tenant: { select: { id: true, name: true } },
        plan: true,
      },
    });

    if (!sub) {
      throw new NotFoundException('No subscription found for this tenant');
    }

    return {
      id: sub.id,
      tenantId: sub.tenant_id,
      tenantName: sub.tenant.name,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      plan: sub.plan
        ? {
            id: sub.plan.id,
            name: sub.plan.name,
            priceMonthly: sub.plan.price_monthly,
            maxBranches: sub.plan.max_branches,
            maxUsers: sub.plan.max_users,
          }
        : null,
    };
  }

  async createPlan(data: {
    name: string;
    priceMonthly: number;
    maxBranches: number;
    maxUsers: number;
  }) {
    const plan = await this.prisma.subscription_plans.create({
      data: {
        name: data.name,
        price_monthly: data.priceMonthly,
        max_branches: data.maxBranches,
        max_users: data.maxUsers,
      },
    });

    return {
      id: plan.id,
      name: plan.name,
      priceMonthly: plan.price_monthly,
      maxBranches: plan.max_branches,
      maxUsers: plan.max_users,
    };
  }

  async assignPlanToTenant(
    tenantId: string,
    planId: string,
    status?: string,
  ) {
    // Check if tenant already has a subscription
    const existing = await this.prisma.tenant_subscriptions.findUnique({
      where: { tenant_id: tenantId },
    });

    if (existing) {
      throw new ConflictException(
        'Tenant already has a subscription. Use update instead.',
      );
    }

    const sub = await this.prisma.tenant_subscriptions.create({
      data: {
        tenant_id: tenantId,
        plan_id: planId,
        status: status || 'active',
        current_period_end: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ), // 30 days from now
      },
      include: {
        plan: true,
        tenant: { select: { name: true } },
      },
    });

    return {
      id: sub.id,
      tenantId: sub.tenant_id,
      tenantName: sub.tenant.name,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        priceMonthly: sub.plan.price_monthly,
      },
    };
  }

  async updateSubscription(
    tenantId: string,
    data: { status?: string; planId?: string },
  ) {
    const updateData: any = {};

    if (data.status) {
      updateData.status = data.status;
    }

    if (data.planId) {
      updateData.plan_id = data.planId;
    }

    const sub = await this.prisma.tenant_subscriptions.update({
      where: { tenant_id: tenantId },
      data: updateData,
      include: {
        plan: true,
        tenant: { select: { name: true } },
      },
    });

    return {
      id: sub.id,
      tenantId: sub.tenant_id,
      tenantName: sub.tenant.name,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        priceMonthly: sub.plan.price_monthly,
      },
    };
  }

  async removePlan(id: string) {
    await this.prisma.subscription_plans.delete({ where: { id } });
    return { success: true };
  }
}
