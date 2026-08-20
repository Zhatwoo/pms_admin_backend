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
  const expressApp = express();

  // Cloud Run requires the port to open quickly — do this before anything else.
  await new Promise<void>((resolve) => {
    expressApp.listen(port, '0.0.0.0', () => {
      console.log(`[startup] Listening on 0.0.0.0:${port}`);
      resolve();
    });
  });

  console.log('[startup] PORT=', process.env.PORT);
  console.log('[startup] DATABASE_URL set=', Boolean(process.env.DATABASE_URL));
  console.log('[startup] SUPABASE_URL set=', Boolean(process.env.SUPABASE_URL));
  console.log(
    '[startup] SUPABASE_SERVICE_ROLE_KEY set=',
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

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
    console.error(
      '[FATAL] Add them in Cloud Run → Edit → Variables & Secrets, then redeploy.',
    );
    expressApp.use((_req, res) => {
      res.status(503).json({
        status: 'error',
        message: 'Missing Cloud Run environment variables',
        missing,
      });
    });
    return;
  }

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
