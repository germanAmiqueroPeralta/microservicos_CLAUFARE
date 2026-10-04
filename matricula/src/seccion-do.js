import { DurableObject } from 'cloudflare:workers';

/**
 * Durable Object: UNA instancia por sección (y por periodo).
 *
 * Cloudflare garantiza que cada instancia procesa sus llamadas de una en una
 * y en un solo lugar del mundo. Como entre leer el conteo y escribir la
 * reserva no hay ningún "await", la operación es atómica: aunque 300 alumnos
 * pidan la última vacante en el mismo milisegundo, solo uno la obtiene.
 */
export class SeccionDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS inscritos (email TEXT PRIMARY KEY, fecha TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  }

  #contar() {
    return this.sql.exec('SELECT COUNT(*) AS n FROM inscritos').one().n;
  }

  #capacidadGuardada() {
    const fila = this.sql.exec("SELECT valor FROM config WHERE clave = 'capacidad'").toArray()[0];
    return fila ? Number(fila.valor) : 0;
  }

  reservar(email, capacidad = this.#capacidadGuardada()) {
    const yaInscrito = this.sql.exec('SELECT 1 FROM inscritos WHERE email = ?', email).toArray().length > 0;
    if (yaInscrito) return { ok: false, motivo: 'Ya tienes una vacante reservada en esta sección' };

    const inscritos = this.#contar();
    if (inscritos >= capacidad) return { ok: false, motivo: 'La sección ya no tiene vacantes' };

    this.sql.exec('INSERT INTO inscritos (email, fecha) VALUES (?, ?)', email, new Date().toISOString());
    return { ok: true, orden: inscritos + 1, disponibles: capacidad - inscritos - 1 };
  }

  liberar(email) {
    this.sql.exec('DELETE FROM inscritos WHERE email = ?', email);
  }

  estado(capacidad = this.#capacidadGuardada()) {
    const inscritos = this.#contar();
    return { capacidad, inscritos, disponibles: Math.max(capacidad - inscritos, 0), sobrecupo: Math.max(inscritos - capacidad, 0) };
  }

  /* ---------- Solo para el simulador de concurrencia (instancias aisladas) ---------- */

  async configurarSimulacion(capacidad) {
    this.sql.exec("INSERT OR REPLACE INTO config (clave, valor) VALUES ('capacidad', ?)", String(capacidad));
    await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000); // se autodestruye en 1 hora
  }

  async limpiar() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
