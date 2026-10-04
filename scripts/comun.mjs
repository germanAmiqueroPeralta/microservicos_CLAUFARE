import { execSync } from 'node:child_process';

// Servicios con base de datos D1 (carpeta y nombre de la base)
export const BASES = [
  ['estudiantes', 'estudiantes-db'],
  ['cursos', 'cursos-db'],
  ['matricula', 'matricula-db'],
  ['pagos', 'pagos-db'],
  ['notificaciones', 'notificaciones-db'],
];

// Orden de despliegue según dependencias (Service Bindings):
// pagos → matricula → cursos; el gateway depende de todos, por eso va al final.
export const ORDEN_DESPLIEGUE = ['estudiantes', 'cursos', 'notificaciones', 'matricula', 'pagos', 'gateway'];

export function ejecutar(comando, opciones = {}) {
  console.log(`\n\x1b[36m> ${comando}\x1b[0m`);
  return execSync(comando, { stdio: 'inherit', ...opciones });
}

export function titulo(texto) {
  console.log(`\n\x1b[1m\x1b[34m=== ${texto} ===\x1b[0m`);
}
