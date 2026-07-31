import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpsertClientDto } from './dto/upsert-client.dto';
import { AdminUser } from '../../../generated/prisma/client';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { id: true, name: true, status: true } } },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true, status: true } } },
    });
    if (!client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
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
