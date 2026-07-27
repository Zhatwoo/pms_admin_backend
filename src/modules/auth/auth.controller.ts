import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators';

const ACCESS_TOKEN_COOKIE = 'admin_access_token';
const WAS_LOGGED_IN_COOKIE = 'admin_was_logged_in';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function authCookieSecure() {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return isProduction();
}

function accessCookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(1, maxAgeSeconds ?? 3600) * 1000,
  };
}

function rememberedCookieOptions(maxAgeSeconds = 2_592_000) {
  return {
    httpOnly: false,
    secure: authCookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(loginDto);

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      session.access_token,
      accessCookieOptions(session.expires_in),
    );
    res.cookie(WAS_LOGGED_IN_COOKIE, '1', rememberedCookieOptions());

    return { user: session.user };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: authCookieSecure(),
      sameSite: 'lax',
    });
    res.clearCookie(WAS_LOGGED_IN_COOKIE, {
      path: '/',
      secure: authCookieSecure(),
      sameSite: 'lax',
    });
    return { success: true };
  }

  @Get('me')
  getMe(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }
}
