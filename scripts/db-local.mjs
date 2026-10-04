// Prepara el entorno LOCAL: bases de datos D1 y secreto de sesión del gateway.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { BASES, ejecutar, titulo } from './comun.mjs';

titulo('Creando bases de datos locales');
for (const [carpeta, base] of BASES) {
  ejecutar(`npx wrangler d1 migrations apply ${base} --local --persist-to .wrangler/state -c ${carpeta}/wrangler.toml`, {
    env: { ...process.env, CI: 'true' }, // responde "sí" automáticamente
  });
}

if (!existsSync('gateway/.dev.vars')) {
  writeFileSync('gateway/.dev.vars', `JWT_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('\nSecreto de sesión local creado en gateway/.dev.vars');
}
console.log('\n✅ Entorno local listo. Ahora ejecuta: npm run dev');
