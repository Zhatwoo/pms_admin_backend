import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly admin: ReturnType<typeof createClient>;

  constructor(configService: ConfigService) {
    const url = configService.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    this.admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}
