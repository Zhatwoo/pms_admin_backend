import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AdminRole } from '../../../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.adminUser;

    if (!user) {
      throw new ForbiddenException(
        'Forbidden resource: user not authenticated',
      );
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        'Forbidden resource: insufficient administrative permissions',
      );
    }

    return true;
  }
}
