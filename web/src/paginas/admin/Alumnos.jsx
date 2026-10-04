import { useState } from 'react';
import { useRetraso } from '../../hooks/useRetraso.js';
import { api } from '../../api/cliente.js';
import { useAvisos } from '../../componentes/Avisos.jsx';
import { Cargando, Encabezado, ErrorCarga, Interruptor, Tarjeta, Vacio } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { fechaHora, iniciales } from '../../utilidades/formato.js';

export default function Alumnos() {
  const notificar = useAvisos();
  const [q, setQ] = useState('');
  const busqueda = useRetraso(q);
  const alumnos = useRecurso(`/estudiantes?q=${encodeURIComponent(busqueda)}`);
  const lista = alumnos.datos || [];

  async function cambiarEstado(alumno, activo) {
    try {
      const actualizado = await api(`/estudiantes/${alumno.id}/estado`, { metodo: 'PATCH', cuerpo: { activo } });
      alumnos.setDatos((l) => l.map((a) => (a.id === alumno.id ? actualizado : a)));
      notificar(`${alumno.nombre}: cuenta ${activo ? 'activada' : 'desactivada'}`);
    } catch (e) {
      notificar(e.message, 'error');
    }
  }

  return (
    <>
      <Encabezado titulo="Alumnos" descripcion="Microservicio de estudiantes · identidad y perfiles" />
      <div className="filtros">
        <label className="buscador">
          <input type="search" placeholder="Buscar por nombre, correo o código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumnos" />
        </label>
      </div>

      <ErrorCarga error={alumnos.error} alReintentar={alumnos.recargar} />
      {alumnos.cargando && !alumnos.datos && <Cargando />}
      {alumnos.datos && !lista.length && <Vacio icono="usuarios" titulo="No se encontraron alumnos" />}

      {lista.length > 0 && (
        <Tarjeta className="sin-relleno" pie={<span className="texto-suave">{lista.length} alumno(s)</span>}>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Alumno</th><th>Código</th><th>Carrera</th><th>Registro</th><th>Cuenta activa</th></tr></thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="celda-usuario">
                        <span className="avatar avatar-chico">{iniciales(a.nombre)}</span>
                        <div><strong>{a.nombre}</strong><small className="texto-suave bloque">{a.email}</small></div>
                      </div>
                    </td>
                    <td className="mono">{a.codigo}</td>
                    <td>{a.carrera}</td>
                    <td className="texto-suave">{fechaHora(a.creado)}</td>
                    <td><Interruptor activo={Boolean(a.activo)} alCambiar={(v) => cambiarEstado(a, v)} etiqueta={`Cuenta de ${a.nombre} activa`} /></td>
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
