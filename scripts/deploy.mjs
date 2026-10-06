// Despliega TODO el sistema en Cloudflare con un solo comando: npm run desplegar
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { BASES, ORDEN_DESPLIEGUE, ejecutar, titulo } from './comun.mjs';

const env = { ...process.env, CI: 'true' };
// En GitHub Actions no hay navegador: se usa CLOUDFLARE_API_TOKEN y cualquier error detiene el despliegue.
const enCI = Boolean(process.env.GITHUB_ACTIONS);

// 1. Verificar sesión en Cloudflare
titulo('1/6 Verificando tu sesión de Cloudflare');
if (enCI) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.error('Faltan los secretos CLOUDFLARE_API_TOKEN y/o CLOUDFLARE_ACCOUNT_ID en GitHub.');
    process.exit(1);
  }
  console.log('Usando el API token de Cloudflare (CI) ✔');
} else try {
  execSync('npx wrangler whoami', { stdio: 'pipe' }).toString().includes('You are logged in') || (() => { throw new Error(); })();
  console.log('Sesión iniciada ✔');
} catch {
  console.log('Abriendo el navegador para iniciar sesión en Cloudflare...');
  ejecutar('npx wrangler login');
}

// 2. Crear la cola (si ya existe, se continúa)
titulo('2/6 Creando la cola de eventos (Queues)');
try {
  execSync('npx wrangler queues create matricula-eventos', { stdio: 'pipe', env });
  console.log('Cola "matricula-eventos" creada ✔');
} catch (e) {
  const lista = execSync('npx wrangler queues list', { stdio: 'pipe', env }).toString();
  if (lista.includes('matricula-eventos')) console.log('La cola ya existía ✔');
  else { console.error(`${e.stdout || ''}${e.stderr || ''}`); process.exit(1); }
}

// 3. Compilar la página web (React)
titulo('3/6 Compilando la página web (React)');
try {
  ejecutar('npm run build -w web');
} catch {
  if (enCI || !existsSync('gateway/public/index.html')) process.exit(1);
  console.log('\n⚠️  No se pudo compilar en esta PC. Se usará la página ya compilada que viene en gateway/public.');
}

// 4. Desplegar cada microservicio (las bases D1 y KV se crean solas la primera vez)
titulo('4/6 Desplegando los microservicios');
for (const servicio of ORDEN_DESPLIEGUE) {
  ejecutar(`npx wrangler deploy -c ${servicio}/wrangler.toml`, { env });
}

// 5. Secreto para firmar las sesiones (solo se crea si no existe)
titulo('5/6 Configurando el secreto de sesión del gateway');
const secretos = execSync('npx wrangler secret list -c gateway/wrangler.toml', { stdio: 'pipe', env }).toString();
if (secretos.includes('JWT_SECRET')) {
  console.log('JWT_SECRET ya estaba configurado ✔');
} else {
  execSync('npx wrangler secret put JWT_SECRET -c gateway/wrangler.toml', {
    input: randomBytes(32).toString('hex'), stdio: ['pipe', 'inherit', 'inherit'], env,
  });
  console.log('JWT_SECRET creado ✔');
}

// 6. Crear o actualizar las tablas en las bases de datos remotas
titulo('6/6 Aplicando migraciones en D1');
for (const [carpeta, base] of BASES) {
  ejecutar(`npx wrangler d1 migrations apply ${base} --remote -c ${carpeta}/wrangler.toml`, { env });
}

console.log(`
\x1b[32m✅ ¡Listo! El sistema de matrícula está en internet.\x1b[0m
Abre la URL "matricula-gateway....workers.dev" que aparece arriba.

Cuentas de demostración:
  Administrador  admin@uni.edu.pe   / Admin2026!
  Alumno         alumno@uni.edu.pe  / Alumno2026!
`);
