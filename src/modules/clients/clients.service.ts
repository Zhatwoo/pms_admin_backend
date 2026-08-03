import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpsertClientDto } from './dto/upsert-client.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { AdminUser, Prisma } from '../../../generated/prisma/client';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  findAll(search?: string) {
    const where: Prisma.ClientWhereInput = search
      ? {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactEmail: { contains: search, mode: 'insensitive' } },
            { contactPhone: { contains: search, mode: 'insensitive' } },
            { tenant: { name: { contains: search, mode: 'insensitive' } } },
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
            _count: { select: { branches: true, users: true, customers: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, subdomain: true, status: true } } },
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
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
            },
            _count: { select: { customers: true, branches: true, users: true } },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: client.tenantId },
      include: { subscription: { include: { plan: true } } },
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

  async create(dto: CreateClientDto, actor: AdminUser) {
    let tenantId = dto.tenantId;

    if (!tenantId) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { subdomain: dto.subdomain },
      });
      if (existingTenant) {
        tenantId = existingTenant.id;
      } else {
        const newTenant = await this.prisma.tenant.create({
          data: {
            name: dto.companyName,
            subdomain: dto.subdomain,
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
        contactPhone: dto.contactPhone,
        billingAddress: dto.billingAddress,
      },
      update: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        billingAddress: dto.billingAddress,
      },
      include: { tenant: true },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'client',
      resourceId: client.id,
      metadata: { companyName: client.companyName, subdomain: dto.subdomain },
    });

    return client;
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

    const client = await this.prisma.client.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'client',
      resourceId: client.id,
      metadata: { tenantId },
    });

    return client;
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
