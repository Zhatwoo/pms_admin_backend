import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Used by the Prisma CLI (migrate, studio, db pull) — needs a direct,
    // non-pooled connection. The app itself connects via PrismaService's
    // pg Pool using DATABASE_URL (pooled), see src/prisma/prisma.service.ts
    url: process.env['DIRECT_URL'],
  },
});
