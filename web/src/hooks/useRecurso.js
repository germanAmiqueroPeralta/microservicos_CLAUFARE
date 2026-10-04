import { useCallback, useEffect, useRef, useState } from 'react';
import { peticion } from '../api/cliente.js';

/**
 * Carga un recurso de la API con estados de carga/error y, opcionalmente,
 * lo refresca cada "intervalo" ms (solo mientras la pestaña está visible).
 * Pasar ruta = null desactiva la carga.
 */
export function useRecurso(ruta, { intervalo } = {}) {
  const [estado, setEstado] = useState({ datos: undefined, meta: null, error: null, cargando: Boolean(ruta) });
  const vigente = useRef(ruta);

  const cargar = useCallback(async (silencioso = false) => {
    if (!ruta) return;
    try {
      const { datos, meta } = await peticion(ruta, { silencioso });
      if (vigente.current === ruta) setEstado({ datos, meta, error: null, cargando: false });
    } catch (error) {
      if (vigente.current === ruta) setEstado((previo) => ({ ...previo, error, cargando: false }));
    }
  }, [ruta]);

  useEffect(() => {
    vigente.current = ruta;
    setEstado((previo) => ({ ...previo, cargando: Boolean(ruta), error: null }));
    cargar();
    if (!intervalo || !ruta) return undefined;
    const temporizador = setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, intervalo);
    return () => clearInterval(temporizador);
  }, [ruta, intervalo, cargar]);

  const setDatos = useCallback((actualizar) => {
    setEstado((previo) => ({ ...previo, datos: typeof actualizar === 'function' ? actualizar(previo.datos) : actualizar }));
  }, []);

  return { ...estado, recargar: cargar, setDatos };
}
