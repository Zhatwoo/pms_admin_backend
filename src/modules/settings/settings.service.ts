import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AdminUser } from '../../../generated/prisma/client';
import type { Prisma } from '../../../generated/prisma/client';

const DEFAULTS: Record<string, Prisma.JsonValue> = {
  platformName: 'PMS SaaS Platform',
  supportEmail: 'support@pms-saas.com',
  enforce2FA: false,
  dataResidency: 'us-east-1',
  taxRate: 12,
  currencySymbol: '$',
  invoiceHeaderNotes: 'Thank you for your business!',
  defaultTrialDays: 14,
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async get() {
    const rows = await this.prisma.platformSetting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULTS, ...stored };
  }

  async update(dto: UpdateSettingsDto, actor: AdminUser) {
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );

    await this.auditLogs.record({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'update',
      resourceType: 'platform_settings',
      metadata: Object.fromEntries(entries),
    });

    return this.get();
  }
}
