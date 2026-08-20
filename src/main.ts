import express from 'express';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 8080);
  const expressApp = express();
  let nestReady = false;

  expressApp.get('/api/health', (_req, res) => {
    res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        status: nestReady ? 'ok' : 'starting',
        timestamp: new Date().toISOString(),
      },
    });
  });

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
    return;
  }

  try {
    const [
      { ValidationPipe },
      { ConfigService },
      { NestFactory },
      { ExpressAdapter },
      cookieParser,
      { AppModule },
      { HttpExceptionFilter },
      { TransformInterceptor },
    ] = await Promise.all([
      import('@nestjs/common'),
      import('@nestjs/config'),
      import('@nestjs/core'),
      import('@nestjs/platform-express'),
      import('cookie-parser').then((m) => m.default),
      import('./app.module'),
      import('./common/filters/http-exception.filter'),
      import('./common/interceptors/transform.interceptor'),
    ]);

    console.log('[startup] modules loaded, initializing Nest');

    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { logger: ['error', 'warn', 'log'] },
    );
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
    nestReady = true;
    console.log('[startup] Nest application ready');
  } catch (error) {
    console.error('[startup] Nest failed to initialize, keeping health endpoint up', error);
  }
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
});
