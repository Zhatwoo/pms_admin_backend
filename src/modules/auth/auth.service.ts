import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { Role } from '../../common/enums';
import { LoginDto } from './dto/login.dto';

export interface AdminUserProfile {
  id: string;
  authId: string;
  email: string;
  fullName: string | null;
  role: Role;
  branchId: string | null;
  avatarUrl: string | null;
  notificationSound: string | null;
  tenantId: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async login(loginDto: LoginDto) {
    const authClient = this.supabaseService.getAuthClient();

    const { data, error } = await authClient.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error) {
      throw new UnauthorizedException(error.message || 'Invalid credentials');
    }

    if (!data?.session?.access_token || !data?.user?.id) {
      throw new InternalServerErrorException(
        'Supabase returned an incomplete session',
      );
    }

    // Look up user in the shared database
    const user = await this.prisma.users.findFirst({
      where: { auth_id: data.user.id },
      select: {
        id: true,
        auth_id: true,
        email: true,
        full_name: true,
        role: true,
        branch_id: true,
        avatar_url: true,
        notification_sound: true,
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

    // Gate: only admin roles can access the admin portal
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMIN) {
      throw new UnauthorizedException(
        'Access denied. Only administrators can access this portal.',
      );
    }

    this.logger.log(`Admin login: ${user.email} (${user.role})`);

    return {
      access_token: data.session.access_token,
      expires_in: data.session.expires_in,
      user: {
        id: user.id,
        authId: user.auth_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        notificationSound: user.notification_sound,
      },
    };
  }

  async getProfile(userId: string): Promise<AdminUserProfile> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        auth_id: true,
        email: true,
        full_name: true,
        role: true,
        branch_id: true,
        avatar_url: true,
        notification_sound: true,
        tenant_id: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    return {
      id: user.id,
      authId: user.auth_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role as Role,
      branchId: user.branch_id,
      avatarUrl: user.avatar_url,
      notificationSound: user.notification_sound,
      tenantId: user.tenant_id,
    };
  }
}
