export function validateEnv() {

  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  const missing = required.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Variáveis obrigatórias ausentes: ${missing.join(', ')}`
    );
  }

  console.log('✅ Variáveis ambiente OK');
}
