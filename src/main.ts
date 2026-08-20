import express from 'express';

process.on('unhandledRejection', (reason) => {
  console.error('[startup] unhandledRejection', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[startup] uncaughtException', error);
});

async function bootstrap() {
  const port = Number(process.env.PORT ?? 8080);
  const expressApp = express();
  let nestReady = false;
  let nestInit: Promise<void> | null = null;

  const requiredEnv = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());

  async function initNest(): Promise<void> {
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`,
      );
    }

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
  }

  function ensureNest(): Promise<void> {
    if (!nestInit) {
      nestInit = initNest().catch((error) => {
        nestInit = null;
        console.error('[startup] Nest failed to initialize', error);
        throw error;
      });
    }
    return nestInit;
  }

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

  expressApp.use(async (req, res, next) => {
    if (req.path === '/api/health') {
      next();
      return;
    }
    try {
      await ensureNest();
      next();
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: 'Application failed to initialize',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
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
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
});
