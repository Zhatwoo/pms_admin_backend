import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminUser } from '../../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateUserDto, actor: AdminUser) {
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new BadRequestException(
        error?.message ?? 'Failed to create auth account',
      );
    }

    try {
      const created = await this.prisma.adminUser.create({
        data: {
          authId: data.user.id,
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
        },
      });

      await this.auditLogs.record({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'create',
        resourceType: 'admin_user',
        resourceId: created.id,
        metadata: { email: created.email, role: created.role },
      });

      return created;
    } catch (err) {
      await this.supabase.admin.auth.admin.deleteUser(data.user.id);
      throw err;
    }
  }

  findAll() {
    return this.prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findAllTenantUsers() {
    return this.prisma.tenantUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { id: true, name: true, subdomain: true } } },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AdminUser) {
    await this.findOne(id);
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: dto,
    });

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'admin_user',
      resourceId: id,
      metadata: dto,
    });

    return updated;
  }

  async remove(id: string, actor: AdminUser): Promise<void> {
    const user = await this.findOne(id);
    await this.prisma.adminUser.delete({ where: { id } });
    await this.supabase.admin.auth.admin.deleteUser(user.authId).catch(() => {});

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'delete',
      resourceType: 'admin_user',
      resourceId: id,
      metadata: { email: user.email },
    });
  }
}
