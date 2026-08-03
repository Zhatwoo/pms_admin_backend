import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AdminUser } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateTenantDto, actor: AdminUser) {
    const { companyName, contactName, contactEmail, contactPhone, billingAddress, ...tenantData } = dto;
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: tenantData.subdomain },
    });
    if (existing) {
      throw new ConflictException('Subdomain is already taken');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        ...tenantData,
        ...(companyName && contactName && contactEmail
          ? {
              client: {
                create: {
                  companyName,
                  contactName,
                  contactEmail,
                  contactPhone,
                  billingAddress,
                },
              },
            }
          : {}),
      },
      include: { client: true },
    });

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
          client: true,
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
        client: tenant.client,
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
        client: true,
        branches: { orderBy: { createdAt: 'desc' } },
        users: { orderBy: { createdAt: 'desc' } },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        _count: { select: { users: true, customers: true, branches: true } },
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

  // --- Branches Management ---
  async findBranches(tenantId: string) {
    await this.ensureExists(tenantId);
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addBranch(tenantId: string, dto: CreateBranchDto, actor: AdminUser) {
    await this.ensureExists(tenantId);
    const branch = await this.prisma.branch.create({
      data: { tenantId, name: dto.name },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'branch',
      resourceId: branch.id,
      metadata: { tenantId, name: branch.name },
    });

    return branch;
  }

  async removeBranch(tenantId: string, branchId: string, actor: AdminUser) {
    await this.ensureExists(tenantId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found under tenant ${tenantId}`);
    }

    await this.prisma.branch.delete({ where: { id: branchId } });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'branch',
      resourceId: branch.id,
      metadata: { tenantId, name: branch.name },
    });
  }

  // --- Tenant Users Management ---
  async findUsers(tenantId: string) {
    await this.ensureExists(tenantId);
    return this.prisma.tenantUser.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addUser(tenantId: string, dto: CreateTenantUserDto, actor: AdminUser) {
    await this.ensureExists(tenantId);
    const existing = await this.prisma.tenantUser.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException(`User ${dto.email} already exists in this tenant.`);
    }

    const user = await this.prisma.tenantUser.create({
      data: { tenantId, email: dto.email, fullName: dto.fullName },
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'create',
      resourceType: 'tenant_user',
      resourceId: user.id,
      metadata: { tenantId, email: user.email },
    });

    return user;
  }

  async removeUser(tenantId: string, userId: string, actor: AdminUser) {
    await this.ensureExists(tenantId);
    const user = await this.prisma.tenantUser.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new NotFoundException(`Tenant user ${userId} not found under tenant ${tenantId}`);
    }

    await this.prisma.tenantUser.delete({ where: { id: userId } });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'tenant_user',
      resourceId: user.id,
      metadata: { tenantId, email: user.email },
    });
  }

  // --- Customers & Transactions ---
  async findCustomers(tenantId: string) {
    await this.ensureExists(tenantId);
    return this.prisma.customer.findMany({
      where: { tenantId },
      include: { _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTransactions(tenantId: string) {
    await this.ensureExists(tenantId);
    return this.prisma.transaction.findMany({
      where: { customer: { tenantId } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
