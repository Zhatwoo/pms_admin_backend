import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminUser } from '../../../generated/prisma/client';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  createPlan(dto: CreatePlanDto) {
    return this.prisma.subscriptionPlan.create({ data: dto });
  }

  findAllPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: 'asc' } });
  }

  async updatePlan(id: string, dto: Partial<CreatePlanDto>) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  async removePlan(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan._count.subscriptions > 0) {
      throw new ConflictException('Cannot delete plan with active subscriptions assigned');
    }
    await this.prisma.subscriptionPlan.delete({ where: { id } });
  }

  async createSubscription(dto: CreateSubscriptionDto, actor: AdminUser) {
    const [tenant, plan] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: dto.tenantId } }),
      this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!plan) throw new NotFoundException('Plan not found');

    const existingActive = await this.prisma.subscription.findFirst({
      where: { tenantId: dto.tenantId, status: 'active' },
    });
    if (existingActive) {
      throw new ConflictException('Tenant already has an active subscription');
    }

    const subscription = await this.prisma.subscription.create({
      data: { tenantId: dto.tenantId, planId: dto.planId, status: 'active' },
      include: { plan: true, tenant: true },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'subscription',
      resourceId: subscription.id,
      metadata: { tenantId: dto.tenantId, planId: dto.planId },
    });

    return subscription;
  }

  findAll() {
    return this.prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      include: { plan: true, tenant: true },
    });
  }

  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, tenant: true },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription with id ${id} not found`);
    }
    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDto, actor: AdminUser) {
    await this.findOne(id);
    const subscription = await this.prisma.subscription.update({
      where: { id },
      data: dto,
      include: { plan: true, tenant: true },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'subscription',
      resourceId: id,
      metadata: dto,
    });

    return subscription;
  }

  async cancel(id: string, actor: AdminUser) {
    return this.update(id, { status: 'canceled' }, actor);
  }
}
