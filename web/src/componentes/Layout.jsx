import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useRecurso } from '../hooks/useRecurso.js';
import { useSesion } from '../sesion/SesionProvider.jsx';
import { iniciales } from '../utilidades/formato.js';
import Icono, { Logo } from './Icono.jsx';
import PanelTrazas from './PanelTrazas.jsx';

const MENU = {
  alumno: [
    { a: '/alumno', icono: 'inicio', texto: 'Inicio', exacto: true },
    { a: '/alumno/cursos', icono: 'libro', texto: 'Oferta de cursos' },
    { a: '/alumno/matricula', icono: 'lista', texto: 'Mi matrícula' },
    { a: '/alumno/pagos', icono: 'tarjeta', texto: 'Pagos' },
    { a: '/alumno/notificaciones', icono: 'campana', texto: 'Notificaciones', contador: true },
  ],
  admin: [
    { a: '/admin', icono: 'grafico', texto: 'Panel general', exacto: true },
    { a: '/admin/cursos', icono: 'libro', texto: 'Cursos y secciones' },
    { a: '/admin/matriculas', icono: 'lista', texto: 'Matrículas' },
    { a: '/admin/alumnos', icono: 'usuarios', texto: 'Alumnos' },
    { a: '/admin/microservicios', icono: 'servidor', texto: 'Microservicios' },
  ],
};

export default function Layout() {
  const { usuario, salir } = useSesion();
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [trazasAbiertas, setTrazasAbiertas] = useState(() => window.matchMedia('(min-width: 1400px)').matches);
  const esAlumno = usuario.rol === 'alumno';
  const notificaciones = useRecurso(esAlumno ? '/notificaciones/mias' : null, { intervalo: 15000 });
  const sinLeer = notificaciones.datos?.sinLeer || 0;

  useEffect(() => setMenuAbierto(false), [pathname]);

  const { recargar: recargarNotificaciones } = notificaciones;
  useEffect(() => {
    const alLeer = () => recargarNotificaciones(true);
    window.addEventListener('notificaciones-leidas', alLeer);
    return () => window.removeEventListener('notificaciones-leidas', alLeer);
  }, [recargarNotificaciones]);

  return (
    <div className={`app ${trazasAbiertas ? 'con-trazas' : ''}`}>
      <a href="#contenido" className="saltar">Saltar al contenido</a>

      <aside className={`lateral ${menuAbierto ? 'abierto' : ''}`}>
        <div className="marca">
          <Logo />
          <div>
            <strong>Matrícula UNI</strong>
            <small>{esAlumno ? 'Portal del alumno' : 'Administración académica'}</small>
          </div>
        </div>
        <nav aria-label="Principal">
          {MENU[usuario.rol].map((item) => (
            <NavLink key={item.a} to={item.a} end={item.exacto} className="nav-item">
              <Icono nombre={item.icono} />
              <span>{item.texto}</span>
              {item.contador && sinLeer > 0 && <span className="nav-contador">{sinLeer}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="lateral-pie">
          <div className="usuario-tarjeta">
            <span className="avatar">{iniciales(usuario.nombre)}</span>
            <div>
              <strong>{usuario.nombre}</strong>
              <small>{usuario.email}</small>
            </div>
          </div>
          <button type="button" className="nav-item" onClick={salir}><Icono nombre="salir" /> <span>Cerrar sesión</span></button>
        </div>
      </aside>
      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

      <div className="principal">
        <header className="barra-superior">
          <button type="button" className="boton-icono solo-movil" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
            <Icono nombre="menu" />
          </button>
          <span className={`rol rol-${usuario.rol}`}>{esAlumno ? 'Alumno' : 'Administrador'}</span>
          <div className="barra-superior-acciones">
            <button
              type="button" className={`boton-trazas ${trazasAbiertas ? 'activo' : ''}`}
              onClick={() => setTrazasAbiertas(!trazasAbiertas)} aria-pressed={trazasAbiertas}
            >
              <Icono nombre="actividad" tamano={16} /> <span>Trazas</span>
            </button>
          </div>
        </header>
        <main id="contenido" className="contenido">
          <Outlet />
        </main>
      </div>

      <PanelTrazas abierto={trazasAbiertas} alCerrar={() => setTrazasAbiertas(false)} />
    </div>
  );
}
