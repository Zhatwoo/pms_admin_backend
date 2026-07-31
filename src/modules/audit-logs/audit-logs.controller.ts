import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.auditLogsService.findAll(query);
  }
}
