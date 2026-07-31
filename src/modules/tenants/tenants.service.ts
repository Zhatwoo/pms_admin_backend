import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AdminUser } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateTenantDto, actor: AdminUser) {
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: dto.subdomain },
    });
    if (existing) {
      throw new ConflictException('Subdomain is already taken');
    }

    const tenant = await this.prisma.tenant.create({ data: dto });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { name: tenant.name, subdomain: tenant.subdomain },
    });

    return tenant;
  }

  async findAll(query: QueryTenantDto) {
    const where: Prisma.TenantWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { subdomain: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: { select: { branches: true, users: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: data.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        createdAt: tenant.createdAt,
        userCount: tenant._count.users,
        branchCount: tenant._count.branches,
        subscriptionPlan: tenant.subscriptions[0]?.plan.name ?? null,
        subscriptionStatus: tenant.subscriptions[0]?.status ?? null,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branches: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        _count: { select: { users: true, customers: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`);
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto, actor: AdminUser) {
    await this.ensureExists(id);
    const tenant = await this.prisma.tenant.update({ where: { id }, data: dto });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: dto,
    });

    return tenant;
  }

  async remove(id: string, actor: AdminUser): Promise<void> {
    const tenant = await this.ensureExists(id);
    await this.prisma.tenant.delete({ where: { id } });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { name: tenant.name },
    });
  }

  private async ensureExists(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`);
    }
    return tenant;
  }
}
