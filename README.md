# Matrícula UNI · Microservicios en Cloudflare Workers

Proyecto del curso **Arquitectura de Software**. Sistema de matrícula con dos roles (**alumno** y **administrador**) construido con **6 microservicios independientes**, cada uno con su propia base de datos, desplegados en Cloudflare.

**Tecnologías:** JavaScript · Hono · React + Vite · Cloudflare Workers · D1 · KV · Durable Objects · Queues · Service Bindings

---

## Arquitectura

```
Navegador (React SPA)
   │  HTTPS · cookie de sesión HttpOnly
   ▼
┌───────────────────────────────────────────────────────────────────┐
│ gateway   Sirve la web · valida la sesión (JWT) · enruta /api/*    │
│           agrega X-Request-Id y Server-Timing (trazas)            │
└───────────────────────────────────────────────────────────────────┘
   │ Service Bindings (red interna, sin URL pública)
   ├──► estudiantes     identidad, contraseñas, perfiles ......... D1
   ├──► cursos          catálogo y secciones ..................... D1 + KV (caché)
   ├──► matricula       reservas de vacantes ..................... D1 + Durable Objects + Queue
   │       └──► cursos  (consulta la sección antes de reservar)
   ├──► pagos           pasarela simulada ........................ D1 + Queue
   │       └──► matricula (verifica y marca como pagada)
   └──► notificaciones  consumidor de la cola .................... D1
              ▲
   matricula / pagos ──► cola "matricula-eventos" (asíncrono)
```

| Servicio | Responsabilidad | Patrón que demuestra |
|---|---|---|
| **gateway** | Punto único de entrada | Autenticación centralizada, enrutamiento, trazabilidad |
| **estudiantes** | Identidad y perfiles | Base de datos por servicio; contraseñas con PBKDF2 |
| **cursos** | Catálogo | *Cache-aside* con KV e invalidación al editar |
| **matricula** | Vacantes y matrículas | Durable Object por sección (sin sobrecupo), compensación, CQRS ligero |
| **pagos** | Pagos | Tolerancia a fallos; no confía en datos del cliente |
| **notificaciones** | Avisos | Comunicación asíncrona; consumidor idempotente con reintentos |

`compartido/` es una librería común (middleware, trazas, seguridad). Se comparte **código**, nunca la base de datos.

### Decisiones de diseño
- **Autenticación en el gateway, autorización en cada servicio.** El gateway valida el JWT y envía la identidad en cabeceras internas. Las cabeceras que manda el navegador se descartan. Cada servicio decide qué rol puede usar cada ruta.
- **Sesión en cookie `HttpOnly` + `SameSite=Strict`.** JavaScript no puede leer el token (XSS) y otros sitios no pueden usarlo (CSRF).
- **El Durable Object es la autoridad de las vacantes**: atiende las reservas de una en una. D1 guarda el registro y responde las lecturas.
- **Compensación:** si falla el registro en D1, se libera la vacante. Si matrícula no confirma un pago, el pago se revierte.
- **Eventos con id único:** la cola entrega "al menos una vez" y notificaciones ignora los duplicados.
- **Migraciones solo hacia adelante:** `0001` es la v1 y `0002` la v2. Nunca se edita una migración ya aplicada.

---

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@uni.edu.pe` | `Admin2026!` |
| Alumno | `alumno@uni.edu.pe` | `Alumno2026!` |
| Alumna | `alumna@uni.edu.pe` | `Alumno2026!` |

Los alumnos nuevos pueden crear su cuenta desde «Crear cuenta». Para un uso real, cambia o desactiva estas cuentas.

---

## Uso

```bash
npm install
npm run db:local    # bases locales + secreto de sesión local (solo la primera vez)
npm run dev         # levanta los 6 Workers en http://localhost:8787
npm run desplegar   # despliega todo en Cloudflare
```

`npm run desplegar` hace, en orden:
1. Inicia sesión en Cloudflare si hace falta.
2. Crea la cola.
3. Compila React.
4. Despliega los 6 Workers según sus dependencias: estudiantes → cursos → notificaciones → matricula → pagos → gateway.
5. Crea el secreto `JWT_SECRET` si no existe.
6. Aplica las migraciones de D1.

Para actualizar un solo servicio: `npx wrangler deploy -c <servicio>/wrangler.toml`.

> **Windows:** si Application Control bloquea `@rollup/rollup-win32-x64-msvc`, el `override` de `package.json` usa `@rollup/wasm-node`, que no tiene binario nativo. Si después de un `npm install` vuelve a aparecer el error, borra `node_modules/rollup` y ejecuta `npm install` otra vez.

---

## Guion para la exposición

1. **Trazas (los dos roles):** abre el botón **Trazas** (arriba a la derecha) y toca cualquier fila. Verás el recorrido de esa acción, por ejemplo `gateway → matricula → cursos → D1 → Durable Object → cola`, con los milisegundos de cada salto.
2. **Caché:** en *Oferta de cursos*, el indicador cambia de «Desde base de datos D1» a «Desde caché KV». Si el admin edita un curso, la caché se invalida.
3. **Reglas de negocio:** el sistema impide los cruces de horario, llevar dos secciones del mismo curso y pasar de 22 créditos.
4. **Concurrencia (admin → Microservicios):** el *Simulador de concurrencia* lanza hasta 300 reservas simultáneas contra un Durable Object aislado. Resultado: exactamente tantas reservas como vacantes, sin sobrecupo, y sin tocar datos reales.
5. **Tolerancia a fallos (admin → Microservicios):** activa *Simular caída*:
   - **pagos:** no se puede pagar, pero sí matricularse.
   - **cursos:** no se ve la oferta, pero *Mi matrícula* sigue funcionando.
   - **estudiantes:** nadie nuevo puede iniciar sesión; quien ya tiene sesión sigue trabajando.
   - **notificaciones:** los eventos esperan en la cola. Al encenderlo, llegan todos (columna «intentos» en *Flujo de eventos*).
6. **Despliegue independiente:** cambia un texto en `cursos/src/index.js` y ejecuta `npx wrangler deploy -c cursos/wrangler.toml`. Solo ese servicio se actualiza.

---

## Estructura
```
matricula-cloudflare/
├── compartido/        librería común (middleware, trazas, seguridad)
├── gateway/           API Gateway + web compilada (public/)
├── estudiantes/       src/ · migrations/ · wrangler.toml
├── cursos/
├── matricula/         src/seccion-do.js (Durable Object)
├── pagos/
├── notificaciones/
├── web/               React: api/ · sesion/ · hooks/ · componentes/ · paginas/{alumno,admin}/
└── scripts/           db-local.mjs · deploy.mjs
```

## Costos
Todo cabe en el **plan gratuito** de Cloudflare. Las vacantes que se ven en pantalla salen de D1 (una consulta) y no del Durable Object, para no gastar su cuota de peticiones al refrescar.
