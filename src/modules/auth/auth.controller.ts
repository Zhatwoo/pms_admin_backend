import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './guards/auth.guard';
import { CurrentAdminUser } from './decorators/current-admin-user.decorator';
import {
  ACCESS_TOKEN_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './auth.cookies';
import { AdminUser } from '../../../generated/prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { adminUser, accessToken, refreshToken } =
      await this.authService.login(dto.email, dto.password);

    setSessionCookies(res, { accessToken, refreshToken });

    return { user: this.authService.toPublicUser(adminUser) };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentAdminUser() adminUser: AdminUser) {
    return this.authService.toPublicUser(adminUser);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as
      | string
      | undefined;
    await this.authService.logout(accessToken);
    clearSessionCookies(res);
    return { success: true };
  }
}
