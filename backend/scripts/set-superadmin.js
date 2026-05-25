import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { ACCESS_MODULES } from '../src/constants/accessModules.js';

const email = String(process.argv[2] || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();

if (!email) {
  console.error('Uso: node scripts/set-superadmin.js email@dominio.com');
  process.exit(1);
}

const allPermissions = ACCESS_MODULES.reduce((acc, moduleKey) => {
  acc[moduleKey] = true;
  return acc;
}, {});

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_super_admins (
      email TEXT PRIMARY KEY,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_access_permissions (
      user_id TEXT PRIMARY KEY,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_only BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error(`Usuário não encontrado para o e-mail: ${email}`);
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO system_super_admins (email, active, updated_at)
     VALUES ($1, true, NOW())
     ON CONFLICT (email)
     DO UPDATE SET active = true, updated_at = NOW()`,
    email
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN', status: 'ATIVO' },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO user_access_permissions (user_id, permissions, read_only, updated_at)
     VALUES ($1, $2::jsonb, false, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET permissions = EXCLUDED.permissions, read_only = false, updated_at = NOW()`,
    user.id,
    JSON.stringify(allPermissions)
  );

  console.log(`Superadmin configurado com sucesso: ${email}`);
  console.log('Faça logout/login novamente para atualizar a sessão.');
}

main()
  .catch((error) => {
    console.error('[set-superadmin] erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
