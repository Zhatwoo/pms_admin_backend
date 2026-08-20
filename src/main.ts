import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 8080);

  console.log('[startup] PORT=', process.env.PORT);
  console.log('[startup] DATABASE_URL set=', Boolean(process.env.DATABASE_URL));
  console.log('[startup] SUPABASE_URL set=', Boolean(process.env.SUPABASE_URL));

  const requiredEnv = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(
      `[FATAL] Missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  // Cloud Run probes PORT before Nest finishes booting — open the port first.
  const expressApp = express();
  await new Promise<void>((resolve) => {
    expressApp.listen(port, '0.0.0.0', () => {
      console.log(`[startup] Listening on 0.0.0.0:${port}`);
      resolve();
    });
  });

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn', 'log'],
  });
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.setGlobalPrefix(apiPrefix);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  await app.init();
  console.log('[startup] Nest application ready');
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
