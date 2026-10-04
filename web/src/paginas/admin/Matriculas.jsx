import { useState } from 'react';
import { useRetraso } from '../../hooks/useRetraso.js';
import { Boton, Cargando, Encabezado, ErrorCarga, Insignia, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { descargarCsv, fechaHora, horario } from '../../utilidades/formato.js';

export default function Matriculas() {
  const [q, setQ] = useState('');
  const [seccion, setSeccion] = useState('');
  const [estado, setEstado] = useState('');
  const busqueda = useRetraso(q);
  const parametros = new URLSearchParams({ q: busqueda, seccion, estado });
  const matriculas = useRecurso(`/matriculas?${parametros}`);
  const catalogo = useRecurso('/cursos?todos=1');

  const secciones = (catalogo.datos?.cursos || []).flatMap((c) => c.secciones.map((s) => ({ id: s.id, curso: c.nombre })));
  const lista = matriculas.datos || [];

  function exportar() {
    descargarCsv(`matriculas-${new Date().toISOString().slice(0, 10)}.csv`, lista.map((m) => ({
      alumno: m.nombre, correo: m.email, curso: m.curso, seccion: m.seccion_id, creditos: m.creditos,
      horario: horario(m), estado: m.estado, fecha: fechaHora(m.fecha),
    })));
  }

  return (
    <>
      <Encabezado titulo="Matrículas" descripcion="Registro del microservicio de matrícula (D1)">
        <Boton variante="secundario" icono="descargar" disabled={!lista.length} onClick={exportar}>Exportar CSV</Boton>
      </Encabezado>

      <div className="filtros">
        <label className="buscador">
          <input type="search" placeholder="Buscar alumno, correo o curso" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar matrículas" />
        </label>
        <select value={seccion} onChange={(e) => setSeccion(e.target.value)} aria-label="Filtrar por sección">
          <option value="">Todas las secciones</option>
          {secciones.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.curso}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE_PAGO">Pendiente de pago</option>
          <option value="PAGADA">Pagada</option>
        </select>
      </div>

      <ErrorCarga error={matriculas.error} alReintentar={matriculas.recargar} />
      {matriculas.cargando && !matriculas.datos && <Cargando />}
      {matriculas.datos && !lista.length && <Vacio icono="lista" titulo="No hay matrículas con estos filtros" />}

      {lista.length > 0 && (
        <Tarjeta className="sin-relleno" pie={<span className="texto-suave">{lista.length} registro(s)</span>}>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Alumno</th><th>Curso</th><th>Sección</th><th>Horario</th><th className="num">Créd.</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.nombre}</strong><small className="texto-suave bloque">{m.email}</small></td>
                    <td>{m.curso}</td>
                    <td className="mono">{m.seccion_id}</td>
                    <td>{horario(m)}</td>
                    <td className="num">{m.creditos}</td>
                    <td>{m.estado === 'PAGADA' ? <Insignia tono="exito">Pagada</Insignia> : <Insignia tono="aviso">Pendiente</Insignia>}</td>
                    <td className="texto-suave">{fechaHora(m.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </>
  );
}
