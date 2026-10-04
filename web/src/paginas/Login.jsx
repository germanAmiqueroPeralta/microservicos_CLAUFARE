import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icono, { Logo } from '../componentes/Icono.jsx';
import { Alerta, Boton, Campo } from '../componentes/ui.jsx';
import { rutaInicio, useSesion } from '../sesion/SesionProvider.jsx';

const CUENTAS_DEMO = [
  { rol: 'Administrador', email: 'admin@uni.edu.pe', password: 'Admin2026!', icono: 'servidor' },
  { rol: 'Alumno', email: 'alumno@uni.edu.pe', password: 'Alumno2026!', icono: 'usuarios' },
];

export function PantallaAcceso({ children }) {
  return (
    <div className="acceso">
      <section className="acceso-marca">
        <div className="marca marca-grande">
          <Logo tamano={44} />
          <div>
            <strong>Matrícula UNI</strong>
            <small>Universidad Nacional de Ingeniería</small>
          </div>
        </div>
        <div className="acceso-mensaje">
          <h1>Proceso de matrícula 2026-2</h1>
          <p>Elige tus cursos, arma tu horario sin cruces y paga en línea. Disponible las 24 horas, incluso el día de mayor demanda.</p>
          <ul className="acceso-puntos">
            <li><Icono nombre="capas" /> 6 microservicios independientes en Cloudflare Workers</li>
            <li><Icono nombre="rayo" /> Catálogo en caché KV y vacantes con Durable Objects</li>
            <li><Icono nombre="campana" /> Notificaciones asíncronas mediante una cola</li>
          </ul>
        </div>
        <small className="acceso-pie">Proyecto del curso Arquitectura de Software</small>
      </section>
      <section className="acceso-formulario">{children}</section>
    </div>
  );
}

export default function Login() {
  const { entrar } = useSesion();
  const navigate = useNavigate();
  const location = useLocation();
  const [datos, setDatos] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const usuario = await entrar(datos.email, datos.password);
      const desde = location.state?.desde;
      navigate(desde?.startsWith(rutaInicio(usuario)) ? desde : rutaInicio(usuario), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso>
      <form className="formulario-acceso" onSubmit={enviar} noValidate={false}>
        <h2>Iniciar sesión</h2>
        <p className="texto-suave">Ingresa con tu correo institucional.</p>

        {error && (
          <Alerta tono={error.servicioCaido ? 'aviso' : 'error'}>
            <strong>{error.message}</strong>
            {error.servicioCaido && <p>El inicio de sesión depende del servicio de estudiantes. Quienes ya tienen sesión siguen trabajando con normalidad.</p>}
          </Alerta>
        )}

        <Campo etiqueta="Correo">
          {(id) => (
            <input id={id} type="email" autoComplete="username" required value={datos.email}
              onChange={(e) => setDatos({ ...datos, email: e.target.value })} placeholder="nombre@uni.edu.pe" />
          )}
        </Campo>
        <Campo etiqueta="Contraseña">
          {(id) => (
            <input id={id} type="password" autoComplete="current-password" required value={datos.password}
              onChange={(e) => setDatos({ ...datos, password: e.target.value })} />
          )}
        </Campo>
        <Boton type="submit" cargando={enviando} className="boton-ancho">Ingresar</Boton>
        <p className="texto-centro texto-suave">¿Eres alumno nuevo? <Link to="/registro">Crea tu cuenta</Link></p>

        <div className="cuentas-demo">
          <span>Cuentas de demostración</span>
          <div>
            {CUENTAS_DEMO.map((c) => (
              <button key={c.email} type="button" className="cuenta-demo" onClick={() => setDatos({ email: c.email, password: c.password })}>
                <Icono nombre={c.icono} />
                <span><strong>{c.rol}</strong><small>{c.email}</small></span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </PantallaAcceso>
  );
}
