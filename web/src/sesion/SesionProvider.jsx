import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/cliente.js';

const SesionContext = createContext(null);

export const rutaInicio = (usuario) => (usuario?.rol === 'admin' ? '/admin' : '/alumno');

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = verificando, null = sin sesión

  useEffect(() => {
    api('/auth/sesion', { silencioso: true }).then(setUsuario).catch(() => setUsuario(null));
    const alExpirar = () => setUsuario(null);
    window.addEventListener('sesion-expirada', alExpirar);
    return () => window.removeEventListener('sesion-expirada', alExpirar);
  }, []);

  const entrar = useCallback(async (email, password) => {
    const u = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password } });
    setUsuario(u);
    return u;
  }, []);

  const registrarse = useCallback(async (datos) => {
    const u = await api('/auth/registro', { metodo: 'POST', cuerpo: datos });
    setUsuario(u);
    return u;
  }, []);

  const salir = useCallback(async () => {
    try { await api('/auth/logout', { metodo: 'POST' }); } finally { setUsuario(null); }
  }, []);

  const valor = useMemo(() => ({ usuario, entrar, registrarse, salir }), [usuario, entrar, registrarse, salir]);
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContext);
  if (!contexto) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return contexto;
}
