import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CreateSuperAdminParams {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  subdomain: string;
}

export interface SuperAdminCreationResult {
  success: boolean;
  authId?: string;
  email: string;
  defaultPassword?: string;
  error?: string;
}

@Injectable()
export class PmsSaasService {
  private readonly logger = new Logger(PmsSaasService.name);
  private saasSupabaseClient: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>(
      'PMS_SAAS_SUPABASE_URL',
      'https://lcngkgmffpfaynwoibpg.supabase.co',
    );
    const serviceRoleKey = this.configService.get<string>(
      'PMS_SAAS_SUPABASE_SERVICE_ROLE_KEY',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjbmdrZ21mZnBmYXlud29pYnBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU5MzM0MywiZXhwIjoyMTAwMTY5MzQzfQ.47dglh6XFcUnVeKbhtWjOKaHxywFxHeDjcq4eVOl5kM',
    );

    if (url && serviceRoleKey) {
      this.saasSupabaseClient = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } else {
      this.logger.warn(
        'PMS SaaS Supabase credentials not provided. SaaS Superadmin account creation will be skipped.',
      );
    }
  }

  /**
   * Generates default password: companyName (alphanumeric) + last 4 digits of contact phone.
   * Example: companyName = "Gold Pawn", contactPhone = "09171234567" => "GoldPawn4567"
   */
  generateDefaultPassword(companyName: string, contactPhone?: string | null): string {
    const cleanCompany = (companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '');
    const phoneDigits = (contactPhone || '').replace(/\D/g, '');
    const last4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '1234';

    let password = `${cleanCompany}${last4}`;
    if (password.length < 6) {
      password = `${password}2026`;
    }
    return password;
  }

  async createSuperAdminAccount(
    params: CreateSuperAdminParams,
  ): Promise<SuperAdminCreationResult> {
    const email = params.contactEmail.trim().toLowerCase();
    const defaultPassword = this.generateDefaultPassword(
      params.companyName,
      params.contactPhone,
    );

    if (!this.saasSupabaseClient) {
      this.logger.error('PMS SaaS Supabase client is not initialized.');
      return { success: false, email, error: 'PMS SaaS client not configured' };
    }

    try {
      this.logger.log(
        `Creating Superadmin account on PMS SaaS DB for ${email} (${params.companyName})...`,
      );

      let authId: string;

      // 1. Create or update user in Supabase Auth on PMS SaaS project
      const { data: authData, error: createAuthError } =
        await this.saasSupabaseClient.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: params.contactName },
          app_metadata: { role: 'super_admin' },
        });

      if (createAuthError) {
        // If user already exists in auth.users, update user password & role
        if (/already|registered|exists/i.test(createAuthError.message)) {
          this.logger.warn(`User ${email} already exists in Auth. Updating password and role...`);
          const { data: usersData, error: listError } =
            await this.saasSupabaseClient.auth.admin.listUsers();
          
          const existingUser = (usersData?.users as Array<{ id: string; email?: string }> | undefined)?.find(
            (u) => u.email?.toLowerCase() === email,
          );
          if (!existingUser) {
            throw new Error(`Failed to locate existing user ${email} in Auth.`);
          }

          authId = existingUser.id;
          const { error: updateAuthError } =
            await this.saasSupabaseClient.auth.admin.updateUserById(authId, {
              password: defaultPassword,
              user_metadata: { full_name: params.contactName },
              app_metadata: { role: 'super_admin' },
            });

          if (updateAuthError) {
            throw new Error(`Failed to update existing user auth: ${updateAuthError.message}`);
          }
        } else {
          throw new Error(`Supabase Auth user creation failed: ${createAuthError.message}`);
        }
      } else {
        if (!authData.user?.id) {
          throw new Error('Supabase Auth user created but returned no ID');
        }
        authId = authData.user.id;
      }

      // 2. Insert or upsert record into public.users table on PMS SaaS DB
      const userRow = {
        auth_id: authId,
        email,
        full_name: params.contactName,
        role: 'super_admin',
        account_status: 'active',
        is_developer: false,
        environment: 'production',
        onboarding_completed: false,
        created_by: authId,
      };

      const { error: dbError } = await this.saasSupabaseClient
        .from('users')
        .upsert(userRow, { onConflict: 'auth_id' });

      if (dbError) {
        this.logger.error(`Failed to upsert public.users row on PMS SaaS DB: ${dbError.message}`);
        // Attempt insert if upsert failed
        const { error: insertError } = await this.saasSupabaseClient
          .from('users')
          .insert(userRow);
        
        if (insertError) {
          this.logger.warn(`Fallback insert also returned: ${insertError.message}`);
        }
      }

      this.logger.log(
        `Successfully created/updated Superadmin account for ${email} (auth_id: ${authId}) on PMS SaaS DB.`,
      );

      return {
        success: true,
        authId,
        email,
        defaultPassword,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error creating Superadmin account on PMS SaaS: ${msg}`);
      return {
        success: false,
        email,
        error: msg,
      };
    }
  }
}
