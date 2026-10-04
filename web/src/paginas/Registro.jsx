import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alerta, Boton, Campo } from '../componentes/ui.jsx';
import { useRecurso } from '../hooks/useRecurso.js';
import { useSesion } from '../sesion/SesionProvider.jsx';
import { PantallaAcceso } from './Login.jsx';

const INICIAL = { nombre: '', codigo: '', carrera: '', email: '', password: '', confirmar: '' };

export default function Registro() {
  const { registrarse } = useSesion();
  const navigate = useNavigate();
  const carreras = useRecurso('/auth/carreras');
  const [datos, setDatos] = useState(INICIAL);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  const noCoinciden = datos.confirmar && datos.password !== datos.confirmar;

  async function enviar(e) {
    e.preventDefault();
    if (noCoinciden) return;
    setEnviando(true);
    setError(null);
    try {
      const { confirmar, ...cuerpo } = datos;
      await registrarse(cuerpo);
      navigate('/alumno', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso>
      <form className="formulario-acceso" onSubmit={enviar}>
        <h2>Crear cuenta de alumno</h2>
        <p className="texto-suave">Tus datos se guardan en el microservicio de estudiantes.</p>
        {error && <Alerta tono="error"><strong>{error.message}</strong></Alerta>}

        <Campo etiqueta="Nombre completo">
          {(id) => <input id={id} required autoComplete="name" value={datos.nombre} onChange={cambiar('nombre')} placeholder="Ej. María Torres Quispe" />}
        </Campo>
        <div className="fila-campos">
          <Campo etiqueta="Código UNI" ayuda="8 dígitos y una letra">
            {(id) => <input id={id} required value={datos.codigo} onChange={cambiar('codigo')} placeholder="20241234A" maxLength={9} pattern="\d{8}[A-Za-z]" />}
          </Campo>
          <Campo etiqueta="Carrera">
            {(id) => (
              <select id={id} required value={datos.carrera} onChange={cambiar('carrera')}>
                <option value="" disabled>{carreras.cargando ? 'Cargando…' : 'Selecciona'}</option>
                {(carreras.datos || []).map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
          </Campo>
        </div>
        <Campo etiqueta="Correo">
          {(id) => <input id={id} type="email" required autoComplete="email" value={datos.email} onChange={cambiar('email')} placeholder="nombre@uni.edu.pe" />}
        </Campo>
        <div className="fila-campos">
          <Campo etiqueta="Contraseña" ayuda="Mínimo 8, con letras y números">
            {(id) => <input id={id} type="password" required minLength={8} autoComplete="new-password" value={datos.password} onChange={cambiar('password')} />}
          </Campo>
          <Campo etiqueta="Confirmar" error={noCoinciden ? 'No coincide' : null}>
            {(id) => <input id={id} type="password" required autoComplete="new-password" value={datos.confirmar} onChange={cambiar('confirmar')} />}
          </Campo>
        </div>
        <Boton type="submit" cargando={enviando} className="boton-ancho" disabled={carreras.error}>Crear cuenta</Boton>
        {carreras.error && <Alerta tono="aviso">{carreras.error.message}</Alerta>}
        <p className="texto-centro texto-suave">¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></p>
      </form>
    </PantallaAcceso>
  );
}
