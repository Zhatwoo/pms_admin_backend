import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/guards/auth.guard';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ClientsModule } from './modules/clients/clients.module';
import { BillingModule } from './modules/billing/billing.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    SupabaseModule,
    MailModule,
    HealthModule,
    AuthModule,
    AuditLogsModule,
    DashboardModule,
    TenantsModule,
    SubscriptionsModule,
    UsersModule,
    ClientsModule,
    BillingModule,
    FinancialModule,
    AnalyticsModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
