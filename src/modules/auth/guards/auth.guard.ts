import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
} from '../auth.cookies';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as
      | string
      | undefined;
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (!accessToken && !refreshToken) {
      throw new UnauthorizedException('Missing bearer token');
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
      throw new UnauthorizedException('Session expired');
    }

    const refreshed = await this.authService.refreshSession(refreshToken);
    setSessionCookies(res, refreshed);
    req.adminUser = await this.authService.getProfileFromAccessToken(
      refreshed.accessToken,
    );
    return true;
  }
}
