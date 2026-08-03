import type { AdminUser } from '../../../generated/prisma/client';

declare module 'express' {
  interface Request {
    adminUser?: AdminUser;
  }
}
