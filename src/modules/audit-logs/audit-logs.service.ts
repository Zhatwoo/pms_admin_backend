import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

interface RecordAuditParams {
  actorId?: string | null;
  actorEmail: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: RecordAuditParams) {
    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata
          ? (JSON.parse(
              JSON.stringify(params.metadata),
            ) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async findAll(query: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
