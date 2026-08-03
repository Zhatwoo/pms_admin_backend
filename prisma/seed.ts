import 'dotenv/config';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'ndelatorre08252002@gmail.com';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.adminUser.findUnique({
    where: { email: SEED_EMAIL },
  });

  if (existing) {
    console.log(`AdminUser already exists for ${SEED_EMAIL}, skipping.`);
    await prisma.$disconnect();
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create Supabase auth user: ${error?.message}`);
  }

  const adminUser = await prisma.adminUser.create({
    data: {
      authId: data.user.id,
      email: SEED_EMAIL,
      fullName: 'Super Admin',
      role: 'super_admin',
      status: 'active',
    },
  });

  console.log('Seeded super_admin AdminUser:');
  console.log(`  email:    ${adminUser.email}`);
  console.log(`  password: ${SEED_PASSWORD}`);
  console.log('Save this password now — it will not be shown again.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
