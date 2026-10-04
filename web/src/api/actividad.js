// Registro en memoria de las llamadas a la API, para el panel "Trazas".
// Cada entrada guarda qué microservicio respondió y el desglose Server-Timing
// (gateway → servicio → KV / D1 / Durable Object / cola / otros servicios).
import { useSyncExternalStore } from 'react';

const MAXIMO = 80;
let registros = [];
const oyentes = new Set();

export function registrarActividad(entrada) {
  registros = [entrada, ...registros].slice(0, MAXIMO);
  oyentes.forEach((avisar) => avisar());
}

export function limpiarActividad() {
  registros = [];
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

export function useActividad() {
  return useSyncExternalStore(suscribir, () => registros);
}

/** "cursos;dur=12, cursos.kv;dur=2;desc=\"HIT\"" → [{ nombre, ms, desc }] */
export function parsearServerTiming(cabecera) {
  if (!cabecera) return [];
  return cabecera.split(',').map((parte) => {
    const [nombre, ...params] = parte.trim().split(';');
    const metrica = { nombre: nombre.trim(), ms: 0, desc: '' };
    for (const p of params) {
      const [clave, valor = ''] = p.trim().split('=');
      if (clave === 'dur') metrica.ms = Number(valor);
      if (clave === 'desc') metrica.desc = valor.replace(/"/g, '');
    }
    return metrica;
  }).filter((m) => m.nombre);
}
