import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createValidationPipe } from './common/pipes';
import { json, urlencoded } from 'express';

function resolveAllowedOrigins(): string[] {
  const configuredOrigins =
    process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '';

  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length > 0) {
    return origins;
  }

  // Development defaults — admin frontend ports
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const allowedOrigins = resolveAllowedOrigins();

  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
    }),
  );

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  });

  const port = configService.get<number>('port') ?? 4000;

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 PMS Admin Backend running on http://localhost:${port}`);
  logger.log(`📋 Health check: http://localhost:${port}/health`);
  logger.log(`🔑 API prefix: /api`);
  logger.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
}

void bootstrap().catch((err: unknown) => {
  const log = new Logger('Bootstrap');
  log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
