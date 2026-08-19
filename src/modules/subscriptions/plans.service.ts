import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Prisma, AdminUser } from '../../../generated/prisma/client';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async createPlan(dto: CreatePlanDto, actor: AdminUser) {
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);

    const existingSlug = await this.prisma.subscriptionPlan.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException(`Plan slug "${slug}" already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.subscriptionPlan.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      if (dto.isPopular) {
        await tx.subscriptionPlan.updateMany({
          where: { isPopular: true },
          data: { isPopular: false },
        });
      }

      const plan = await tx.subscriptionPlan.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          visibleOnLanding: dto.visibleOnLanding ?? true,
          isDefault: dto.isDefault ?? false,
          isPopular: dto.isPopular ?? false,
        },
      });

      const version = await tx.subscriptionPlanVersion.create({
        data: {
          planId: plan.id,
          versionNumber: 1,
          monthlyPrice: dto.monthlyPrice,
          annualPrice: dto.annualPrice,
          currency: dto.currency ?? 'PHP',
          billingType: dto.billingType ?? 'both',
          trialEnabled: dto.trialEnabled ?? false,
          trialDays: dto.trialDays ?? 7,
          branchLimit: dto.branchLimit ?? 1,
          userLimit: dto.userLimit ?? 5,
          storageGb: dto.storageGb ?? 5,
          isActive: true,
          features: dto.features
            ? {
                create: dto.features.map((f, idx) => ({
                  name: f.name,
                  enabled: f.enabled ?? true,
                  displayOrder: f.displayOrder ?? idx,
                })),
              }
            : undefined,
          inclusions: dto.inclusions
            ? {
                create: dto.inclusions.map((inc, idx) => ({
                  name: inc.name,
                  displayOrder: inc.displayOrder ?? idx,
                })),
              }
            : undefined,
          addons: dto.addons
            ? {
                create: dto.addons.map((add, idx) => ({
                  name: add.name,
                  price: add.price,
                  unit: add.unit,
                  enabled: add.enabled ?? true,
                  displayOrder: add.displayOrder ?? idx,
                })),
              }
            : undefined,
        },
        include: {
          features: { orderBy: { displayOrder: 'asc' } },
          inclusions: { orderBy: { displayOrder: 'asc' } },
          addons: { orderBy: { displayOrder: 'asc' } },
        },
      });

      await this.auditLogs.record({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'create',
        resourceType: 'subscription_plan',
        resourceId: plan.id,
        metadata: { name: plan.name, slug: plan.slug, versionId: version.id },
      });

      return this.findPlanById(plan.id, tx);
    });
  }

  async findAllPlans(includeArchived = false) {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (!includeArchived) {
      where.deletedAt = null;
      where.isActive = true;
    }

    const plans = await this.prisma.subscriptionPlan.findMany({
      where,
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            features: { orderBy: { displayOrder: 'asc' } },
            inclusions: { orderBy: { displayOrder: 'asc' } },
            addons: { orderBy: { displayOrder: 'asc' } },
            _count: { select: { subscriptions: true } },
          },
        },
      },
    });

    const formattedPlans = plans.map((plan) => {
      const activeVersion = plan.versions[0] ?? null;
      return {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        isActive: plan.isActive,
        visibleOnLanding: plan.visibleOnLanding,
        isDefault: plan.isDefault,
        isPopular: plan.isPopular,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        deletedAt: plan.deletedAt,
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              versionNumber: activeVersion.versionNumber,
              monthlyPrice: Number(activeVersion.monthlyPrice),
              annualPrice: Number(activeVersion.annualPrice),
              currency: activeVersion.currency,
              billingType: activeVersion.billingType,
              trialEnabled: activeVersion.trialEnabled,
              trialDays: activeVersion.trialDays,
              limits: {
                branchLimit: activeVersion.branchLimit,
                userLimit: activeVersion.userLimit,
                storageGb: Number(activeVersion.storageGb),
              },
              features: activeVersion.features,
              inclusions: activeVersion.inclusions,
              addons: activeVersion.addons.map((a) => ({
                ...a,
                price: Number(a.price),
              })),
              subscriberCount: activeVersion._count.subscriptions,
            }
          : null,
      };
    });

    formattedPlans.sort((a, b) => {
      const priceA = a.activeVersion?.monthlyPrice ?? 0;
      const priceB = b.activeVersion?.monthlyPrice ?? 0;
      if (priceA === 0) return 1;
      if (priceB === 0) return -1;
      return priceA - priceB;
    });

    // Automate isDefault (lowest non-zero plan) and isPopular (most subscribed or middle plan)
    let maxSubscribers = -1;
    let popularPlanId: string | null = null;

    formattedPlans.forEach((p) => {
      const subCount = p.activeVersion?.subscriberCount ?? 0;
      if (subCount > maxSubscribers && subCount > 0) {
        maxSubscribers = subCount;
        popularPlanId = p.id;
      }
    });

    if (!popularPlanId && formattedPlans.length > 0) {
      const middleIdx = Math.floor(formattedPlans.length / 2);
      popularPlanId = formattedPlans[middleIdx]?.id ?? formattedPlans[0]?.id;
    }

    return formattedPlans.map((p, idx) => ({
      ...p,
      isDefault: idx === 0,
      isPopular: p.id === popularPlanId,
    }));
  }

  async findPlanById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const plan = await client.subscriptionPlan.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            features: { orderBy: { displayOrder: 'asc' } },
            inclusions: { orderBy: { displayOrder: 'asc' } },
            addons: { orderBy: { displayOrder: 'asc' } },
            _count: { select: { subscriptions: true } },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Subscription plan with id ${id} not found`);
    }

    const activeVersion =
      plan.versions.find((v) => v.isActive) ?? plan.versions[0] ?? null;

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      isActive: plan.isActive,
      visibleOnLanding: plan.visibleOnLanding,
      isDefault: plan.isDefault,
      isPopular: plan.isPopular,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      deletedAt: plan.deletedAt,
      activeVersion: activeVersion
        ? {
            id: activeVersion.id,
            versionNumber: activeVersion.versionNumber,
            monthlyPrice: Number(activeVersion.monthlyPrice),
            annualPrice: Number(activeVersion.annualPrice),
            currency: activeVersion.currency,
            billingType: activeVersion.billingType,
            trialEnabled: activeVersion.trialEnabled,
            trialDays: activeVersion.trialDays,
            limits: {
              branchLimit: activeVersion.branchLimit,
              userLimit: activeVersion.userLimit,
              storageGb: Number(activeVersion.storageGb),
            },
            features: activeVersion.features,
            inclusions: activeVersion.inclusions,
            addons: activeVersion.addons.map((a) => ({
              ...a,
              price: Number(a.price),
            })),
            subscriberCount: activeVersion._count.subscriptions,
          }
        : null,
      allVersions: plan.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        monthlyPrice: Number(v.monthlyPrice),
        annualPrice: Number(v.annualPrice),
        isActive: v.isActive,
        createdAt: v.createdAt,
        subscriberCount: v._count.subscriptions,
      })),
    };
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: AdminUser) {
    const existing = await this.findPlanById(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.subscriptionPlan.updateMany({
          where: { id: { not: id }, isDefault: true },
          data: { isDefault: false },
        });
      }

      if (dto.isPopular) {
        await tx.subscriptionPlan.updateMany({
          where: { id: { not: id }, isPopular: true },
          data: { isPopular: false },
        });
      }

      const newSlug = dto.slug
        ? this.slugify(dto.slug)
        : dto.name
          ? this.slugify(dto.name)
          : existing.slug;
      if (newSlug !== existing.slug) {
        const slugConflict = await tx.subscriptionPlan.findFirst({
          where: { slug: newSlug, id: { not: id } },
        });
        if (slugConflict) {
          throw new ConflictException(
            `Plan slug "${newSlug}" is already in use`,
          );
        }
      }

      await tx.subscriptionPlan.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          slug: newSlug,
          description:
            dto.description !== undefined
              ? dto.description
              : existing.description,
          visibleOnLanding:
            dto.visibleOnLanding !== undefined
              ? dto.visibleOnLanding
              : existing.visibleOnLanding,
          isDefault:
            dto.isDefault !== undefined ? dto.isDefault : existing.isDefault,
          isPopular:
            dto.isPopular !== undefined ? dto.isPopular : existing.isPopular,
        },
      });

      const currentVer = existing.activeVersion;

      const hasPricingOrLimitChange =
        dto.monthlyPrice !== undefined ||
        dto.annualPrice !== undefined ||
        dto.billingType !== undefined ||
        dto.trialEnabled !== undefined ||
        dto.trialDays !== undefined ||
        dto.branchLimit !== undefined ||
        dto.userLimit !== undefined ||
        dto.storageGb !== undefined ||
        dto.features !== undefined ||
        dto.inclusions !== undefined ||
        dto.addons !== undefined;

      if (hasPricingOrLimitChange && currentVer) {
        // Deactivate previous versions
        await tx.subscriptionPlanVersion.updateMany({
          where: { planId: id },
          data: { isActive: false },
        });

        const newVersionNumber =
          (existing.allVersions[0]?.versionNumber ?? 0) + 1;

        const newVersion = await tx.subscriptionPlanVersion.create({
          data: {
            planId: id,
            versionNumber: newVersionNumber,
            monthlyPrice: dto.monthlyPrice ?? currentVer.monthlyPrice,
            annualPrice: dto.annualPrice ?? currentVer.annualPrice,
            currency: dto.currency ?? currentVer.currency,
            billingType: dto.billingType ?? currentVer.billingType,
            trialEnabled: dto.trialEnabled ?? currentVer.trialEnabled,
            trialDays: dto.trialDays ?? currentVer.trialDays,
            branchLimit: dto.branchLimit ?? currentVer.limits.branchLimit,
            userLimit: dto.userLimit ?? currentVer.limits.userLimit,
            storageGb: dto.storageGb ?? currentVer.limits.storageGb,
            isActive: true,
            features: {
              create: (dto.features ?? currentVer.features).map((f, idx) => ({
                name: f.name,
                enabled: f.enabled ?? true,
                displayOrder: f.displayOrder ?? idx,
              })),
            },
            inclusions: {
              create: (dto.inclusions ?? currentVer.inclusions).map(
                (inc, idx) => ({
                  name: inc.name,
                  displayOrder: inc.displayOrder ?? idx,
                }),
              ),
            },
            addons: {
              create: (
                dto.addons ??
                (currentVer.addons as Array<{
                  name: string;
                  price: number;
                  unit?: string | null;
                  enabled?: boolean;
                  displayOrder?: number;
                }>)
              ).map((add, idx) => ({
                name: add.name,
                price: add.price,
                unit: add.unit,
                enabled: add.enabled ?? true,
                displayOrder: add.displayOrder ?? idx,
              })),
            },
          },
        });

        await this.auditLogs.record({
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'update',
          resourceType: 'subscription_plan_version',
          resourceId: newVersion.id,
          metadata: { planId: id, versionNumber: newVersionNumber },
        });
      }

      await this.auditLogs.record({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'update',
        resourceType: 'subscription_plan',
        resourceId: id,
        metadata: dto,
      });

      return this.findPlanById(id, tx);
    });
  }

  async removePlan(id: string, actor: AdminUser) {
    const plan = await this.findPlanById(id);

    const activeSubscribers = await this.prisma.subscription.count({
      where: {
        planVersion: { planId: id },
        status: { in: ['active', 'trialing', 'past_due'] },
      },
    });

    if (activeSubscribers > 0) {
      // Perform soft-delete
      await this.prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });

      await this.auditLogs.record({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'delete',
        resourceType: 'subscription_plan',
        resourceId: id,
        metadata: { mode: 'soft-delete', activeSubscribers },
      });

      return {
        softDeleted: true,
        message: `Plan "${plan.name}" deactivated (soft-deleted).`,
      };
    }

    // Hard delete if no active subscribers
    await this.prisma.subscriptionPlan.delete({
      where: { id },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'subscription_plan',
      resourceId: id,
      metadata: { mode: 'hard-delete' },
    });

    return { softDeleted: false, message: `Plan "${plan.name}" deleted.` };
  }

  async getPublicLandingPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        isActive: true,
        visibleOnLanding: true,
        deletedAt: null,
      },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
          include: {
            features: {
              where: { enabled: true },
              orderBy: { displayOrder: 'asc' },
            },
            inclusions: { orderBy: { displayOrder: 'asc' } },
            addons: {
              where: { enabled: true },
              orderBy: { displayOrder: 'asc' },
            },
            _count: { select: { subscriptions: true } },
          },
        },
      },
    });

    const formattedPublicPlans = plans.map((plan) => {
      const ver = plan.versions[0] ?? null;
      return {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        isDefault: plan.isDefault,
        isPopular: plan.isPopular,
        monthlyPrice: ver ? Number(ver.monthlyPrice) : 0,
        annualPrice: ver ? Number(ver.annualPrice) : 0,
        currency: ver?.currency ?? 'PHP',
        billingType: ver?.billingType ?? 'both',
        trialEnabled: ver?.trialEnabled ?? false,
        trialDays: ver?.trialDays ?? 0,
        limits: ver
          ? {
              branchLimit: ver.branchLimit,
              userLimit: ver.userLimit,
              storageGb: Number(ver.storageGb),
            }
          : null,
        features: ver ? ver.features.map((f) => f.name) : [],
        inclusions: ver ? ver.inclusions.map((i) => i.name) : [],
        addons: ver
          ? ver.addons.map((a) => ({
              id: a.id,
              name: a.name,
              price: Number(a.price),
              unit: a.unit,
            }))
          : [],
      };
    });

    formattedPublicPlans.sort((a, b) => {
      if (a.monthlyPrice === 0) return 1;
      if (b.monthlyPrice === 0) return -1;
      return a.monthlyPrice - b.monthlyPrice;
    });

    let maxSubscribers = -1;
    let popularPlanId: string | null = null;

    plans.forEach((plan) => {
      const ver = plan.versions[0];
      const count = ver?._count?.subscriptions ?? 0;
      if (count > maxSubscribers && count > 0) {
        maxSubscribers = count;
        popularPlanId = plan.id;
      }
    });

    if (!popularPlanId && formattedPublicPlans.length > 0) {
      const middleIdx = Math.floor(formattedPublicPlans.length / 2);
      popularPlanId =
        formattedPublicPlans[middleIdx]?.id ?? formattedPublicPlans[0]?.id;
    }

    const finalPublicPlans = formattedPublicPlans.map((p, idx) => ({
      ...p,
      isDefault: idx === 0,
      isPopular: p.id === popularPlanId,
    }));

    return {
      plans: finalPublicPlans,
    };
  }
}
