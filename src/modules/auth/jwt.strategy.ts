import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { PrismaService } from '../../infrastructure/prisma';
import { parseCookieHeader } from '../../common/utils/cookie.util';
import { Role } from '../../common/enums';

interface JwtPayload {
  sub: string;
  email: string;
  aud: string;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const supabaseUrl = configService.get<string>('supabase.url');
    const supabaseJwtSecret = configService.get<string>('supabase.jwtSecret');
    const jwksSecretProvider = passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    });

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Admin cookie (separate from PMS SaaS cookie)
        (req) => {
          const cookies = parseCookieHeader(req?.headers?.cookie);
          return cookies.admin_access_token || null;
        },
        // Fallback: Authorization header (for API testing)
        (req) =>
          process.env.ALLOW_BEARER_AUTH === 'true'
            ? ExtractJwt.fromAuthHeaderAsBearerToken()(req)
            : null,
      ]),
      ignoreExpiration: false,
      algorithms: ['RS256', 'ES256', 'HS256'],
      secretOrKeyProvider: (
        _req: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string | Buffer) => void,
      ) => {
        try {
          const headerSegment = rawJwtToken?.split('.')?.[0];

          if (!headerSegment) {
            return done(new Error('Invalid JWT format'));
          }

          const decodedHeader = JSON.parse(
            Buffer.from(headerSegment, 'base64url').toString('utf8'),
          ) as { alg?: string };

          if (decodedHeader.alg === 'HS256') {
            if (!supabaseJwtSecret) {
              return done(new Error('Missing SUPABASE_JWT_SECRET'));
            }
            return done(null, supabaseJwtSecret);
          }

          return jwksSecretProvider(_req, rawJwtToken, done as any);
        } catch (error) {
          return done(error as Error);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Look up the user by Supabase auth ID
    const user = await this.prisma.users.findFirst({
      where: { auth_id: payload.sub },
      select: {
        id: true,
        auth_id: true,
        email: true,
        full_name: true,
        role: true,
        branch_id: true,
        avatar_url: true,
        account_status: true,
        tenant_id: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    if (user.account_status === 'pending') {
      throw new UnauthorizedException('Account pending approval');
    }

    if (user.account_status === 'rejected') {
      throw new UnauthorizedException('Account rejected');
    }

    // Only allow admin roles to access the admin portal
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMIN) {
      throw new UnauthorizedException(
        'Insufficient permissions. Admin access required.',
      );
    }

    return {
      id: user.id,
      authId: user.auth_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role as Role,
      branchId: user.branch_id,
      avatarUrl: user.avatar_url,
      tenantId: user.tenant_id,
    };
  }
}
