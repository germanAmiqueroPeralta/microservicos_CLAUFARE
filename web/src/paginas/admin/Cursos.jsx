import { useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAvisos } from '../../componentes/Avisos.jsx';
import { Alerta, Boton, Campo, Cargando, Encabezado, ErrorCarga, Insignia, Modal, Tarjeta } from '../../componentes/ui.jsx';
import { useRecurso } from '../../hooks/useRecurso.js';
import { DIAS, horario, nombreDias } from '../../utilidades/formato.js';

const CURSO_VACIO = { id: '', nombre: '', creditos: 4, ciclo: 1, area: 'Ciencias Básicas', descripcion: '', activo: 1 };
const SECCION_VACIA = { docente: '', dias: ['LU', 'MI'], hora_inicio: '08:00', hora_fin: '10:00', aula: '', capacidad: 30, activa: 1 };

export default function Cursos() {
  const notificar = useAvisos();
  const catalogo = useRecurso('/cursos?todos=1');
  const vacantes = useRecurso('/vacantes');
  const [editor, setEditor] = useState(null); // { tipo: 'curso' | 'seccion', nuevo, datos, cursoId }
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const abrir = (estado) => { setError(null); setEditor(estado); };
  const cambiar = (campo, valor) => setEditor((e) => ({ ...e, datos: { ...e.datos, [campo]: valor } }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const { tipo, nuevo, datos, cursoId } = editor;
    try {
      if (tipo === 'curso') {
        await api(nuevo ? '/cursos' : `/cursos/${datos.id}`, { metodo: nuevo ? 'POST' : 'PUT', cuerpo: datos });
      } else {
        await api(nuevo ? `/cursos/${cursoId}/secciones` : `/secciones/${datos.id}`, { metodo: nuevo ? 'POST' : 'PUT', cuerpo: datos });
      }
      notificar(`${tipo === 'curso' ? 'Curso' : 'Sección'} guardado. La caché KV del catálogo se invalidó.`);
      setEditor(null);
      catalogo.recargar();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  }

  async function alternarSeccion(s) {
    try {
      await api(`/secciones/${s.id}`, { metodo: 'PUT', cuerpo: { ...s, activa: s.activa ? 0 : 1 } });
      notificar(`Sección ${s.id} ${s.activa ? 'desactivada' : 'activada'}`);
      catalogo.recargar();
    } catch (err) {
      notificar(err.message, 'error');
    }
  }

  const cursos = catalogo.datos?.cursos || [];
  const datos = editor?.datos;

  return (
    <>
      <Encabezado titulo="Cursos y secciones" descripcion="Microservicio de cursos · cada cambio invalida la caché KV del catálogo">
        <Boton icono="mas" onClick={() => abrir({ tipo: 'curso', nuevo: true, datos: CURSO_VACIO })}>Nuevo curso</Boton>
      </Encabezado>

      <ErrorCarga error={catalogo.error} alReintentar={catalogo.recargar} />
      {catalogo.cargando && !catalogo.datos && <Cargando />}

      <div className="lista-cursos-admin">
        {cursos.map((c) => (
          <Tarjeta key={c.id} className={c.activo ? '' : 'inactivo'}
            titulo={<><span className="codigo">{c.id}</span> {c.nombre}</>}
            acciones={(
              <div className="acciones">
                {!c.activo && <Insignia>Inactivo</Insignia>}
                <Insignia tono="marca">{c.creditos} créd. · Ciclo {c.ciclo}</Insignia>
                <Boton tamano="chico" variante="secundario" icono="editar" onClick={() => abrir({ tipo: 'curso', nuevo: false, datos: c })}>Editar</Boton>
                <Boton tamano="chico" variante="secundario" icono="mas" onClick={() => abrir({ tipo: 'seccion', nuevo: true, cursoId: c.id, datos: SECCION_VACIA })}>Sección</Boton>
              </div>
            )}
          >
            <div className="tabla-contenedor">
              <table className="tabla tabla-compacta">
                <thead><tr><th>Sección</th><th>Docente</th><th>Horario</th><th>Aula</th><th className="num">Inscritos</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {c.secciones.map((s) => (
                    <tr key={s.id} className={s.activa ? '' : 'fila-inactiva'}>
                      <td className="mono">{s.id}</td>
                      <td>{s.docente}</td>
                      <td>{horario(s)}</td>
                      <td>{s.aula}</td>
                      <td className="num">{vacantes.datos?.[s.id] || 0} / {s.capacidad}</td>
                      <td>{s.activa ? <Insignia tono="exito">Activa</Insignia> : <Insignia>Inactiva</Insignia>}</td>
                      <td className="acciones">
                        <Boton tamano="chico" variante="fantasma" onClick={() => abrir({ tipo: 'seccion', nuevo: false, datos: { ...s, dias: s.dias.split(',') } })}>Editar</Boton>
                        <Boton tamano="chico" variante="fantasma" onClick={() => alternarSeccion(s)}>{s.activa ? 'Desactivar' : 'Activar'}</Boton>
                      </td>
                    </tr>
                  ))}
                  {!c.secciones.length && <tr><td colSpan={7} className="texto-suave">Sin secciones. Agrega una con el botón «Sección».</td></tr>}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        ))}
      </div>

      <Modal
        abierto={Boolean(editor)} alCerrar={() => setEditor(null)}
        titulo={editor && `${editor.nuevo ? 'Nuevo' : 'Editar'} ${editor.tipo === 'curso' ? 'curso' : `sección${editor.nuevo ? ` de ${editor.cursoId}` : ` ${datos.id}`}`}`}
        pie={<><Boton variante="secundario" onClick={() => setEditor(null)}>Cancelar</Boton><Boton type="submit" form="form-editor" cargando={guardando}>Guardar</Boton></>}
      >
        {editor && (
          <form id="form-editor" className="formulario" onSubmit={guardar}>
            {error && <Alerta tono="error">{error.message}</Alerta>}
            {editor.tipo === 'curso' ? (
              <>
                <div className="fila-campos">
                  <Campo etiqueta="Código">{(id) => <input id={id} required disabled={!editor.nuevo} value={datos.id} onChange={(e) => cambiar('id', e.target.value.toUpperCase())} placeholder="BQU03" />}</Campo>
                  <Campo etiqueta="Créditos">{(id) => <input id={id} type="number" min={1} max={6} required value={datos.creditos} onChange={(e) => cambiar('creditos', Number(e.target.value))} />}</Campo>
                  <Campo etiqueta="Ciclo">{(id) => <input id={id} type="number" min={1} max={10} required value={datos.ciclo} onChange={(e) => cambiar('ciclo', Number(e.target.value))} />}</Campo>
                </div>
                <Campo etiqueta="Nombre">{(id) => <input id={id} required value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Química III" />}</Campo>
                <Campo etiqueta="Área">{(id) => <input id={id} value={datos.area} onChange={(e) => cambiar('area', e.target.value)} />}</Campo>
                <Campo etiqueta="Descripción">{(id) => <textarea id={id} rows={2} maxLength={300} value={datos.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />}</Campo>
                {!editor.nuevo && (
                  <label className="casilla"><input type="checkbox" checked={Boolean(datos.activo)} onChange={(e) => cambiar('activo', e.target.checked ? 1 : 0)} /> Curso activo (visible para los alumnos)</label>
                )}
              </>
            ) : (
              <>
                <Campo etiqueta="Docente">{(id) => <input id={id} required value={datos.docente} onChange={(e) => cambiar('docente', e.target.value)} placeholder="Dra. Rosa Medina" />}</Campo>
                <fieldset className="dias">
                  <legend>Días</legend>
                  {DIAS.map((d) => (
                    <label key={d} className={`dia ${datos.dias.includes(d) ? 'activo' : ''}`}>
                      <input type="checkbox" checked={datos.dias.includes(d)}
                        onChange={(e) => cambiar('dias', e.target.checked ? [...datos.dias, d] : datos.dias.filter((x) => x !== d))} />
                      {nombreDias(d)}
                    </label>
                  ))}
                </fieldset>
                <div className="fila-campos">
                  <Campo etiqueta="Inicio">{(id) => <input id={id} type="time" required step={1800} value={datos.hora_inicio} onChange={(e) => cambiar('hora_inicio', e.target.value)} />}</Campo>
                  <Campo etiqueta="Fin">{(id) => <input id={id} type="time" required step={1800} value={datos.hora_fin} onChange={(e) => cambiar('hora_fin', e.target.value)} />}</Campo>
                </div>
                <div className="fila-campos">
                  <Campo etiqueta="Aula">{(id) => <input id={id} required value={datos.aula} onChange={(e) => cambiar('aula', e.target.value)} placeholder="R1-201" />}</Campo>
                  <Campo etiqueta="Vacantes" ayuda="El Durable Object usa esta capacidad">{(id) => <input id={id} type="number" min={1} max={200} required value={datos.capacidad} onChange={(e) => cambiar('capacidad', Number(e.target.value))} />}</Campo>
                </div>
              </>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
