const ZONA = 'America/Lima';
const NOMBRE_DIA = { LU: 'Lun', MA: 'Mar', MI: 'Mié', JU: 'Jue', VI: 'Vie', SA: 'Sáb' };
export const DIAS = Object.keys(NOMBRE_DIA);

const moneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
export const soles = (monto) => moneda.format(Number(monto) || 0);

// D1 guarda "2026-10-02 20:52:43" en UTC (sin zona); se interpreta como UTC.
const aFecha = (valor) => new Date(/Z|[+-]\d\d:?\d\d$/.test(valor) ? valor : `${String(valor).replace(' ', 'T')}Z`);

export const fechaHora = (valor) => (valor
  ? aFecha(valor).toLocaleString('es-PE', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' })
  : '—');

export function haceCuanto(valor) {
  const segundos = Math.round((Date.now() - aFecha(valor)) / 1000);
  if (segundos < 60) return 'hace un momento';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  return fechaHora(valor);
}

export const nombreDias = (dias) => String(dias || '').split(',').map((d) => NOMBRE_DIA[d] || d).join(' · ');
export const horario = (s) => `${nombreDias(s.dias)} ${s.hora_inicio}–${s.hora_fin}`;

export const seCruzan = (a, b) =>
  a.dias.split(',').some((d) => b.dias.split(',').includes(d)) && a.hora_inicio < b.hora_fin && b.hora_inicio < a.hora_fin;

export const iniciales = (nombre = '') =>
  nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function descargarCsv(nombreArchivo, filas) {
  if (!filas.length) return;
  const columnas = Object.keys(filas[0]);
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenido = [columnas.join(','), ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' }));
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
  enlace.click();
  URL.revokeObjectURL(url);
}
