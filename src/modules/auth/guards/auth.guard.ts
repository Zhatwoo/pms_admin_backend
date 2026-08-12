import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
} from '../auth.cookies';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const authHeader = req.headers.authorization;
    let bearerToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      bearerToken = authHeader.substring(7).trim();
    }

    const accessToken =
      bearerToken || (req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined);
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (!accessToken && !refreshToken) {
      throw new UnauthorizedException('Unauthorized request');
    }

    if (accessToken) {
      try {
        req.adminUser =
          await this.authService.getProfileFromAccessToken(accessToken);
        return true;
      } catch {
        // fall through to refresh
      }
    }

    if (!refreshToken) {
      throw new UnauthorizedException('Unauthorized request');
    }

    try {
      const refreshed = await this.authService.refreshSession(refreshToken);
      setSessionCookies(res, refreshed);
      req.adminUser = await this.authService.getProfileFromAccessToken(
        refreshed.accessToken,
      );
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized request');
    }
  }
}
