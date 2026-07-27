import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import WebSocket from 'ws';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly client: SupabaseClient;
  private readonly url: string;
  private readonly anonKey: string;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('supabase.url');
    const anonKey = this.configService.get<string>('supabase.anonKey');
    const serviceRoleKey = this.configService.get<string>(
      'supabase.serviceRoleKey',
    );

    if (!url || !serviceRoleKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
      );
    }

    this.url = url;
    this.anonKey = anonKey || '';
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: {
        transport: WebSocket as unknown as WebSocketLikeConstructor,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  /** Anon-key client for user-context operations (e.g. signInWithPassword). */
  getAuthClient(): SupabaseClient {
    if (!this.url || !this.anonKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment',
      );
    }

    return createClient(this.url, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: {
        transport: WebSocket as unknown as WebSocketLikeConstructor,
      },
    });
  }
}
