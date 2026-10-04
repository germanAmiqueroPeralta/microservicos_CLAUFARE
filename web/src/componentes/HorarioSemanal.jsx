import { DIAS } from '../utilidades/formato.js';

const NOMBRES = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const HORA_INICIO = 7;
const HORA_FIN = 22;
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export default function HorarioSemanal({ matriculas }) {
  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i);
  const colores = new Map(matriculas.map((m, i) => [m.curso_id, i % 8]));
  const total = (HORA_FIN - HORA_INICIO) * 60;

  return (
    <div className="horario" role="table" aria-label="Horario semanal">
      <div className="horario-horas" aria-hidden="true">
        <span />
        {horas.map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
      </div>
      {DIAS.map((dia) => (
        <div key={dia} className="horario-dia" role="rowgroup">
          <strong className="horario-dia-nombre">{NOMBRES[dia]}</strong>
          <div className="horario-columna">
            {matriculas.filter((m) => m.dias.split(',').includes(dia)).map((m) => {
              const inicio = minutos(m.hora_inicio) - HORA_INICIO * 60;
              const duracion = minutos(m.hora_fin) - minutos(m.hora_inicio);
              return (
                <div
                  key={m.id} role="cell" className={`horario-bloque color-${colores.get(m.curso_id)}`}
                  style={{ top: `${(inicio / total) * 100}%`, height: `${(duracion / total) * 100}%` }}
                  title={`${m.curso} · ${m.hora_inicio}–${m.hora_fin} · ${m.aula}`}
                >
                  <strong>{m.curso}</strong>
                  <span>{m.hora_inicio}–{m.hora_fin} · {m.aula}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
