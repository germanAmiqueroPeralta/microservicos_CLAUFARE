import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icono from './Icono.jsx';

const AvisosContext = createContext(() => {});

export function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([]);

  const quitar = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const notificar = useCallback((texto, tono = 'exito') => {
    const id = crypto.randomUUID();
    setAvisos((lista) => [...lista.slice(-3), { id, texto, tono }]);
    setTimeout(() => quitar(id), tono === 'error' ? 6000 : 4000);
  }, [quitar]);

  const valor = useMemo(() => notificar, [notificar]);

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tono}`}>
            <Icono nombre={a.tono === 'error' ? 'alerta' : 'check'} />
            <span>{a.texto}</span>
            <button type="button" onClick={() => quitar(a.id)} aria-label="Cerrar aviso"><Icono nombre="cerrar" tamano={14} /></button>
          </div>
        ))}
      </div>
    </AvisosContext.Provider>
  );
}

export const useAvisos = () => useContext(AvisosContext);
