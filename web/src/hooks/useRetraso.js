import { useEffect, useState } from 'react';

/** Devuelve "valor" solo cuando deja de cambiar durante "ms" (evita una petición por tecla). */
export function useRetraso(valor, ms = 350) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
