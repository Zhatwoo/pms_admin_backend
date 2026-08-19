import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpsertClientDto } from './dto/upsert-client.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { AdminUser, Prisma } from '../../../generated/prisma/client';

import { PmsSaasService, SuperAdminCreationResult } from './pms-saas.service';
import { MailService } from '../mail/mail.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly pmsSaasService: PmsSaasService,
    private readonly mailService: MailService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  findAll(search?: string) {
    const where: Prisma.ClientWhereInput = search
      ? {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
            { contactPhone: { contains: search, mode: 'insensitive' } },
            { mobileNumber: { contains: search, mode: 'insensitive' } },
            { telephoneNumber: { contains: search, mode: 'insensitive' } },
            { tenant: { name: { contains: search, mode: 'insensitive' } } },
            {
              tenant: { subdomain: { contains: search, mode: 'insensitive' } },
            },
          ],
        }
      : {};

    return this.prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            status: true,
            createdAt: true,
            _count: {
              select: { branches: true, users: true, customers: true },
            },
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { planVersion: { include: { plan: true } } },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        tenant: {
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { planVersion: { include: { plan: true } } },
            },
          },
        },
      },
    });
    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    return client;
  }

  async findDetails(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        tenant: {
          include: {
            branches: { orderBy: { createdAt: 'desc' } },
            users: { orderBy: { createdAt: 'desc' } },
            subscriptions: {
              include: { planVersion: { include: { plan: true } } },
              orderBy: { createdAt: 'desc' },
            },
            _count: {
              select: { customers: true, branches: true, users: true },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: client.tenantId },
      include: {
        subscription: { include: { planVersion: { include: { plan: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      ...client,
      tenant: {
        ...client.tenant,
        invoices,
      },
    };
  }

  private async getTenantPlanParams(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      include: {
        planVersion: {
          include: {
            plan: true,
            features: { orderBy: { displayOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) return {};

    return {
      planName: sub.planVersion.plan.name,
      branchLimit: sub.planVersion.branchLimit,
      userLimit: sub.planVersion.userLimit,
      storageGb: Number(sub.planVersion.storageGb),
      features: sub.planVersion.features.map((f) => f.name),
      status: sub.status,
      endsAt: sub.endsAt,
    };
  }

  async create(dto: CreateClientDto, actor: AdminUser) {
    let tenantId = dto.tenantId;
    const effectiveSubdomain = dto.noDomain
      ? null
      : dto.subdomain?.trim() || null;

    if (!tenantId) {
      if (effectiveSubdomain) {
        const existingTenant = await this.prisma.tenant.findUnique({
          where: { subdomain: effectiveSubdomain },
        });
        if (existingTenant) {
          tenantId = existingTenant.id;
        }
      }

      if (!tenantId) {
        const newTenant = await this.prisma.tenant.create({
          data: {
            name: dto.companyName,
            subdomain: effectiveSubdomain,
            status: 'active',
          },
        });
        tenantId = newTenant.id;
      }
    }

    const client = await this.prisma.client.upsert({
      where: { tenantId },
      create: {
        tenantId,
        companyName: dto.companyName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone || dto.mobileNumber || null,
        mobileNumber: dto.mobileNumber || null,
        telephoneNumber: dto.telephoneNumber || null,
        billingAddress: dto.billingAddress || null,
      },
      update: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone || dto.mobileNumber || null,
        mobileNumber: dto.mobileNumber || null,
        telephoneNumber: dto.telephoneNumber || null,
        billingAddress: dto.billingAddress || null,
      },
      include: { tenant: true },
    });

    if (dto.planId) {
      try {
        const existingSub = await this.prisma.subscription.findFirst({
          where: { tenantId, status: { in: ['active', 'trialing'] } },
        });
        if (!existingSub) {
          await this.subscriptionsService.createSubscription(
            { tenantId, planId: dto.planId },
            actor,
          );
        }
      } catch {
        // Silently handle subscription assignment error
      }
    }

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'client',
      resourceId: client.id,
      metadata: {
        companyName: client.companyName,
        subdomain: effectiveSubdomain,
      },
    });

    const isComplete =
      !!effectiveSubdomain && !!client.contactEmail && !!client.contactName;

    let emailSent = false;
    let saasResult: SuperAdminCreationResult = {
      success: false,
      email: client.contactEmail,
    };

    if (isComplete && effectiveSubdomain) {
      const planParams = await this.getTenantPlanParams(tenantId);

      saasResult = await this.pmsSaasService.createSuperAdminAccount({
        companyName: client.companyName,
        contactName: client.contactName,
        contactEmail: client.contactEmail,
        contactPhone: client.mobileNumber || client.contactPhone,
        subdomain: effectiveSubdomain,
        ...planParams,
      });

      if (saasResult.success && saasResult.defaultPassword) {
        emailSent = await this.mailService.sendSuperAdminCredentials({
          toEmail: client.contactEmail,
          contactName: client.contactName,
          companyName: client.companyName,
          subdomain: effectiveSubdomain,
          defaultPassword: saasResult.defaultPassword,
        });

        if (emailSent) {
          await this.prisma.client.update({
            where: { id: client.id },
            data: {
              welcomeEmailSentAt: new Date(),
              welcomeEmailCount: 1,
            },
          });
        }
      }
    }

    const updatedClient = await this.findOne(client.id);

    return {
      ...updatedClient,
      superadminAccount: {
        created: saasResult.success,
        email: client.contactEmail,
        defaultPassword: saasResult.defaultPassword,
        emailSent,
        error: saasResult.error,
      },
    };
  }

  async upsertForTenant(
    tenantId: string,
    dto: UpsertClientDto,
    actor: AdminUser,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${tenantId} not found`);
    }

    if (dto.noDomain !== undefined || dto.subdomain !== undefined) {
      const newSubdomain = dto.noDomain ? null : dto.subdomain?.trim() || null;
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { subdomain: newSubdomain },
      });
    }

    const client = await this.prisma.client.upsert({
      where: { tenantId },
      create: {
        tenantId,
        companyName: dto.companyName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone || dto.mobileNumber || null,
        mobileNumber: dto.mobileNumber || null,
        telephoneNumber: dto.telephoneNumber || null,
        billingAddress: dto.billingAddress || null,
      },
      update: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone || dto.mobileNumber || null,
        mobileNumber: dto.mobileNumber || null,
        telephoneNumber: dto.telephoneNumber || null,
        billingAddress: dto.billingAddress || null,
      },
    });

    if (dto.planId) {
      try {
        const existingSub = await this.prisma.subscription.findFirst({
          where: { tenantId, status: { in: ['active', 'trialing'] } },
        });
        if (existingSub) {
          await this.subscriptionsService.changePlan(
            existingSub.id,
            { newPlanId: dto.planId },
            actor,
          );
        } else {
          await this.subscriptionsService.createSubscription(
            { tenantId, planId: dto.planId },
            actor,
          );
        }
      } catch {
        // Silently handle subscription assignment error
      }
    }

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'client',
      resourceId: client.id,
      metadata: { tenantId },
    });

    return this.findOne(client.id);
  }

  async sendWelcomeEmail(id: string, actor: AdminUser) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { tenant: true },
    });

    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    if (!client.tenant.subdomain) {
      throw new BadRequestException(
        'Cannot send welcome email: Client information is incomplete. A valid domain name must be assigned first.',
      );
    }

    if (!client.contactEmail || !client.contactName) {
      throw new BadRequestException(
        'Cannot send welcome email: Client contact name and email must be provided.',
      );
    }

    const planParams = await this.getTenantPlanParams(client.tenantId);

    const saasResult = await this.pmsSaasService.createSuperAdminAccount({
      companyName: client.companyName,
      contactName: client.contactName,
      contactEmail: client.contactEmail,
      contactPhone: client.mobileNumber || client.contactPhone,
      subdomain: client.tenant.subdomain,
      ...planParams,
    });

    if (!saasResult.success || !saasResult.defaultPassword) {
      throw new BadRequestException(
        `Failed to provision Superadmin account on PMS SaaS: ${saasResult.error || 'Unknown error'}`,
      );
    }

    const emailSent = await this.mailService.sendSuperAdminCredentials({
      toEmail: client.contactEmail,
      contactName: client.contactName,
      companyName: client.companyName,
      subdomain: client.tenant.subdomain,
      defaultPassword: saasResult.defaultPassword,
    });

    if (!emailSent) {
      throw new BadRequestException(
        'Failed to send email. Please check SMTP settings.',
      );
    }

    const updatedClient = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        welcomeEmailSentAt: new Date(),
        welcomeEmailCount: (client.welcomeEmailCount || 0) + 1,
      },
      include: { tenant: true },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'client',
      resourceId: client.id,
      metadata: {
        action: 'send_welcome_email',
        welcomeEmailCount: updatedClient.welcomeEmailCount,
      },
    });

    return {
      message:
        updatedClient.welcomeEmailCount > 1
          ? 'Welcome email resent successfully'
          : 'Welcome email sent successfully',
      welcomeEmailSentAt: updatedClient.welcomeEmailSentAt,
      welcomeEmailCount: updatedClient.welcomeEmailCount,
      defaultPassword: saasResult.defaultPassword,
    };
  }

  async remove(id: string, actor: AdminUser): Promise<void> {
    const client = await this.findOne(id);
    await this.prisma.client.delete({ where: { id } });
    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'client',
      resourceId: client.id,
    });
  }
}
