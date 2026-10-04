import { useMemo, useState } from 'react';
import { useAvisos } from '../../componentes/Avisos.jsx';
import Icono from '../../componentes/Icono.jsx';
import { Alerta, BarraProgreso, Boton, Cargando, Encabezado, ErrorCarga, Insignia, Vacio } from '../../componentes/ui.jsx';
import { api } from '../../api/cliente.js';
import { useRecurso } from '../../hooks/useRecurso.js';
import { horario, seCruzan } from '../../utilidades/formato.js';

export default function OfertaCursos() {
  const notificar = useAvisos();
  const catalogo = useRecurso('/cursos');
  const vacantes = useRecurso('/vacantes', { intervalo: 5000 });
  const mias = useRecurso('/matriculas/mias');
  const proceso = useRecurso('/matriculas/proceso');
  const [busqueda, setBusqueda] = useState('');
  const [ciclo, setCiclo] = useState('');
  const [procesando, setProcesando] = useState(null);

  const matriculas = mias.datos || [];
  const creditos = matriculas.reduce((t, m) => t + m.creditos, 0);
  const maxCreditos = proceso.datos?.maxCreditos ?? 22;

  const cursos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (catalogo.datos?.cursos || []).filter((c) =>
      (!ciclo || String(c.ciclo) === ciclo)
      && (!texto || c.nombre.toLowerCase().includes(texto) || c.id.toLowerCase().includes(texto)
        || c.secciones.some((s) => s.docente.toLowerCase().includes(texto))));
  }, [catalogo.datos, busqueda, ciclo]);

  const ciclos = [...new Set((catalogo.datos?.cursos || []).map((c) => c.ciclo))].sort();

  async function matricular(curso, seccion) {
    setProcesando(seccion.id);
    try {
      const m = await api('/matriculas', { metodo: 'POST', cuerpo: { seccionId: seccion.id } });
      notificar(`Te matriculaste en ${curso.nombre} (${seccion.id}). Quedan ${m.vacantesRestantes} vacantes.`);
      mias.setDatos((lista) => [...(lista || []), m]);
      vacantes.recargar(true);
    } catch (e) {
      notificar(e.message, 'error');
      vacantes.recargar(true);
    } finally {
      setProcesando(null);
    }
  }

  function estadoSeccion(curso, seccion) {
    const inscritos = vacantes.datos?.[seccion.id] || 0;
    const disponibles = Math.max(seccion.capacidad - inscritos, 0);
    const actual = matriculas.find((m) => m.curso_id === curso.id);
    if (actual?.seccion_id === seccion.id) return { inscritos, disponibles, bloqueo: 'matriculado' };
    if (actual) return { inscritos, disponibles, bloqueo: 'otra', texto: `Llevas la sección ${actual.seccion_id}` };
    if (!proceso.datos?.abierto) return { inscritos, disponibles, bloqueo: 'cerrado', texto: 'Matrícula cerrada' };
    if (disponibles === 0) return { inscritos, disponibles, bloqueo: 'lleno', texto: 'Sin vacantes' };
    if (creditos + curso.creditos > maxCreditos) return { inscritos, disponibles, bloqueo: 'creditos', texto: 'Excede tus créditos' };
    const cruce = matriculas.find((m) => seCruzan(m, seccion));
    if (cruce) return { inscritos, disponibles, bloqueo: 'cruce', texto: `Cruce con ${cruce.curso}` };
    return { inscritos, disponibles };
  }

  return (
    <>
      <Encabezado titulo="Oferta de cursos" descripcion={`Periodo ${proceso.datos?.periodo || ''} · Ciencias Básicas`}>
        {catalogo.meta && (
          <span className={`chip-origen ${catalogo.datos.origen}`} title="Origen de los datos del catálogo según el microservicio de cursos">
            <Icono nombre={catalogo.datos.origen === 'kv' ? 'rayo' : 'base'} tamano={14} />
            {catalogo.datos.origen === 'kv' ? 'Desde caché KV' : 'Desde base de datos D1'} · {catalogo.meta.ms} ms
          </span>
        )}
      </Encabezado>

      <div className="resumen-creditos">
        <div>
          <span className="texto-suave">Tus créditos</span>
          <strong>{creditos} de {maxCreditos}</strong>
        </div>
        <BarraProgreso valor={creditos} maximo={maxCreditos} />
      </div>

      {proceso.datos && !proceso.datos.abierto && <Alerta tono="aviso" icono="candado">El proceso de matrícula está cerrado. Solo puedes consultar la oferta.</Alerta>}
      {vacantes.error && <Alerta tono="aviso">Las vacantes no se están actualizando: {vacantes.error.message}</Alerta>}

      <div className="filtros">
        <label className="buscador">
          <Icono nombre="buscar" />
          <input type="search" placeholder="Buscar por curso, código o docente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar cursos" />
        </label>
        <select value={ciclo} onChange={(e) => setCiclo(e.target.value)} aria-label="Filtrar por ciclo">
          <option value="">Todos los ciclos</option>
          {ciclos.map((c) => <option key={c} value={c}>Ciclo {c}</option>)}
        </select>
      </div>

      <ErrorCarga error={catalogo.error} alReintentar={catalogo.recargar} />
      {catalogo.cargando && !catalogo.datos && <Cargando texto="Cargando catálogo…" />}
      {catalogo.datos && !cursos.length && <Vacio icono="buscar" titulo="No hay cursos que coincidan">Prueba con otro término de búsqueda.</Vacio>}

      <div className="rejilla-cursos">
        {cursos.map((curso) => (
          <article key={curso.id} className="tarjeta curso">
            <header className="curso-cabecera">
              <div>
                <span className="codigo">{curso.id}</span>
                <h3>{curso.nombre}</h3>
                <p className="texto-suave">{curso.descripcion}</p>
              </div>
              <div className="curso-meta">
                <Insignia tono="marca">{curso.creditos} créditos</Insignia>
                <small className="texto-suave">Ciclo {curso.ciclo} · {curso.area}</small>
              </div>
            </header>
            <ul className="secciones">
              {curso.secciones.map((s) => {
                const e = estadoSeccion(curso, s);
                return (
                  <li key={s.id} className={`seccion ${e.bloqueo === 'matriculado' ? 'seccion-mia' : ''}`}>
                    <div className="seccion-datos">
                      <strong>Sección {s.id.split('-').pop()}</strong>
                      <span>{s.docente}</span>
                      <span className="texto-suave"><Icono nombre="reloj" tamano={13} /> {horario(s)}</span>
                      <span className="texto-suave"><Icono nombre="ubicacion" tamano={13} /> Aula {s.aula}</span>
                    </div>
                    <div className="seccion-vacantes">
                      <BarraProgreso valor={e.inscritos} maximo={s.capacidad} />
                      <small><strong>{e.disponibles}</strong> de {s.capacidad} vacantes</small>
                    </div>
                    <div className="seccion-accion">
                      {e.bloqueo === 'matriculado' ? <Insignia tono="exito"><Icono nombre="check" tamano={13} /> Matriculado</Insignia>
                        : e.bloqueo ? <span className="texto-suave texto-chico">{e.texto}</span>
                          : (
                            <Boton tamano="chico" cargando={procesando === s.id} disabled={Boolean(procesando)} onClick={() => matricular(curso, s)}>
                              Matricularme
                            </Boton>
                          )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
