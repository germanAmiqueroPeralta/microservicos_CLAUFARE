# Sistema de Matrícula UNI
### Arquitectura de microservicios en Cloudflare Workers

**Universidad Nacional de Ingeniería · Curso: Arquitectura de Software**
Informe técnico y resumen del proyecto · Octubre de 2026

**Sistema en producción:** https://matricula-gateway.german-amiquero-27.workers.dev

---

## Contenido
1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Objetivo y alcance](#2-objetivo-y-alcance)
3. [Tecnologías](#3-tecnologías)
4. [Arquitectura general](#4-arquitectura-general)
5. [Microservicios](#5-microservicios)
6. [Funcionalidades por rol](#6-funcionalidades-por-rol)
7. [Reglas de negocio](#7-reglas-de-negocio)
8. [Seguridad](#8-seguridad)
9. [Escalabilidad y balanceo de carga](#9-escalabilidad-y-balanceo-de-carga)
10. [Tolerancia a fallos](#10-tolerancia-a-fallos)
11. [Observabilidad](#11-observabilidad)
12. [Frontend: buenas prácticas aplicadas](#12-frontend-buenas-prácticas-aplicadas)
13. [Modelo de datos](#13-modelo-de-datos)
14. [Despliegue](#14-despliegue)
15. [Pruebas](#15-pruebas)
16. [Guion de demostración](#16-guion-de-demostración)
17. [Limitaciones y trabajo futuro](#17-limitaciones-y-trabajo-futuro)
- [Anexos](#anexos)

---

## 1. Resumen ejecutivo

Matrícula UNI es un sistema de matrícula universitaria construido con una **arquitectura de microservicios** y desplegado en **Cloudflare Workers**. Tiene dos tipos de usuario: **alumno** y **administrador**. Está pensado para resistir el pico de tráfico del día de matrícula sin vender más vacantes de las que existen (sobrecupo).

El sistema está formado por **6 microservicios independientes**: un API Gateway público y cinco servicios internos (estudiantes, cursos, matrícula, pagos y notificaciones). Cada uno tiene su propio código, su propia base de datos y se despliega por separado. Se comunican de dos formas: síncrona, mediante Service Bindings, y asíncrona, mediante una cola de eventos.

**Resultados principales:**
- El sistema está **desplegado y funcionando** en la nube, dentro del plan gratuito de Cloudflare.
- Una prueba automática de **39 verificaciones** pasa completa, tanto en local como en producción.
- Con **120 reservas simultáneas** sobre una sección de 5 vacantes, se aceptaron exactamente **5** y se rechazaron 115: **cero sobrecupo**.
- Con el servicio de pagos apagado, los alumnos **siguieron matriculándose** con normalidad: los fallos quedan aislados.
- La segunda lectura del catálogo, servida desde la caché KV, tardó **3 ms**, frente a **461 ms** de la primera lectura desde la base de datos.

---

## 2. Objetivo y alcance

### 2.1 Objetivo
Demostrar en un sistema real cómo se comporta una arquitectura de microservicios: independencia de despliegue, base de datos por servicio, escalamiento horizontal, tolerancia a fallos, comunicación síncrona y asíncrona, y control de concurrencia.

### 2.2 Roles del sistema
| Rol | Qué puede hacer |
|---|---|
| **Alumno** | Ver la oferta de cursos con vacantes en tiempo real, matricularse, retirarse, pagar, ver su horario semanal, imprimir su constancia y recibir notificaciones. |
| **Administrador** | Ver indicadores generales, abrir o cerrar el proceso de matrícula, gestionar cursos y secciones, consultar matrículas y alumnos, exportar a CSV y supervisar los microservicios (simular caídas, simular concurrencia y ver el flujo de eventos). |

### 2.3 Catálogo de cursos
El catálogo corresponde a Ciencias Básicas de la UNI: **10 cursos y 14 secciones**, con docentes, aulas y horarios.

| Ciclo | Cursos |
|---|---|
| 1 | Química I (BQU01), Cálculo Diferencial (BMA01), Física I (BFI01), Introducción a la Computación (BIC01), Redacción y Técnicas de Comunicación (BRN01), Dibujo de Ingeniería (BDI01) |
| 2 | Química II (BQU02), Cálculo Integral (BMA02), Álgebra Lineal (BMA03), Física II (BFI02) |

La sección **BFI02-A** (Física II) tiene solo 5 vacantes a propósito, para mostrar el caso de «sección llena».

---

## 3. Tecnologías

| Tecnología | Uso en el proyecto |
|---|---|
| **Cloudflare Workers** | Ejecuta cada microservicio sin administrar servidores (serverless). |
| **Hono** | Framework web ligero para la API de cada microservicio. |
| **React + Vite** | Aplicación web (SPA). Se compila dentro del gateway. |
| **React Router** | Rutas separadas por rol y carga diferida del código de cada rol. |
| **D1 (SQLite)** | Base de datos propia de cada servicio (5 bases). |
| **KV** | Caché global del catálogo de cursos. |
| **Durable Objects** | Control atómico de vacantes: una instancia por sección. |
| **Queues** | Cola de eventos `matricula-eventos` para las notificaciones. |
| **Service Bindings** | Llamadas internas entre Workers, sin URL pública. |
| **Web Crypto** | Contraseñas con PBKDF2-SHA256 y firma de sesiones JWT. |
| **Wrangler 4** | Herramienta de despliegue; crea las bases y la caché automáticamente. |

---

## 4. Arquitectura general

Todas las peticiones entran por el **API Gateway**. El gateway sirve la página web, valida la sesión del usuario y reenvía cada petición al microservicio dueño del recurso. Los servicios internos **no tienen URL pública**: solo se puede llegar a ellos a través del gateway.

```
Navegador (React SPA)
   │  HTTPS · cookie de sesión HttpOnly
   ▼
gateway ── sirve la web · valida el JWT · enruta /api/* · agrega trazas
   │  Service Bindings (red interna de Cloudflare)
   ├──► estudiantes ......... D1
   ├──► cursos .............. D1 + KV
   ├──► matricula ........... D1 + Durable Objects + Queue
   │       └──► cursos        (consulta la sección)
   ├──► pagos ............... D1 + Queue
   │       └──► matricula     (verifica y marca como pagada)
   └──► notificaciones ...... D1
              ▲
   matricula / pagos ──► cola "matricula-eventos" (asíncrono)
```

### 4.1 Comunicación entre servicios
| Origen | Destino | Tipo | Motivo |
|---|---|---|---|
| gateway | los 5 servicios | Síncrona (Service Binding) | Enrutar las peticiones de la web |
| matricula | cursos | Síncrona | Obtener la capacidad y el horario de la sección antes de reservar |
| pagos | matricula | Síncrona | Verificar la matrícula y marcarla como pagada |
| matricula | cola → notificaciones | Asíncrona (Queue) | Avisar de matrículas y retiros sin hacer esperar al alumno |
| pagos | cola → notificaciones | Asíncrona (Queue) | Avisar de pagos confirmados |

### 4.2 Librería compartida
La carpeta `compartido/` contiene código común a todos los servicios: manejo de errores, trazas, verificación de roles, llamadas entre servicios y la simulación de fallas. Se comparte **código**, nunca la base de datos: cada servicio sigue siendo el único dueño de sus datos.

---

## 5. Microservicios

| Servicio | Responsabilidad | Almacenamiento | Patrón que demuestra |
|---|---|---|---|
| **gateway** | Punto único de entrada | Archivos estáticos | Autenticación centralizada, enrutamiento, trazabilidad |
| **estudiantes** | Identidad, contraseñas y perfiles | D1 `estudiantes-db` | Base de datos por servicio |
| **cursos** | Catálogo de cursos y secciones | D1 `cursos-db` + KV | Caché (cache-aside) con invalidación |
| **matricula** | Reserva de vacantes y matrículas | D1 `matricula-db` + Durable Objects + Queue | Control de concurrencia, compensación |
| **pagos** | Pasarela de pagos (simulada) | D1 `pagos-db` + Queue | Tolerancia a fallos, validación en el servidor |
| **notificaciones** | Avisos al alumno | D1 `notificaciones-db` | Comunicación asíncrona, idempotencia |

### 5.1 Gateway
- Sirve la aplicación React y aplica cabeceras de seguridad (CSP, X-Frame-Options, etc.).
- Valida la sesión una sola vez y envía la identidad verificada a los servicios en cabeceras internas.
- Descarta las cabeceras de identidad que envíe el navegador, para que nadie pueda hacerse pasar por otro usuario.
- Genera un identificador único por petición (`X-Request-Id`) y combina las trazas `Server-Timing` de toda la cadena.
- Expone el monitor de microservicios (salud de cada servicio y simulación de caídas), solo para el administrador.

### 5.2 Estudiantes
- Guarda usuarios con su rol, código UNI y carrera. Las contraseñas se guardan con **PBKDF2-SHA256** y una sal aleatoria; nunca en texto plano.
- Valida el registro: correo, nombre, código UNI (8 dígitos y una letra), carrera y contraseña (mínimo 8 caracteres, con letras y números).
- Ante un login fallido responde el mismo mensaje exista o no el correo, para no revelar qué cuentas existen.

### 5.3 Cursos
- La primera lectura del catálogo va a D1 y se guarda en KV durante 5 minutos; las siguientes salen de KV.
- Cuando el administrador crea o edita un curso o una sección, la caché se invalida al instante.
- Valida los datos: código del curso, créditos (1 a 6), días, horas y capacidad.

### 5.4 Matrícula
Es el núcleo del sistema. El flujo de una matrícula es:
1. Consulta la sección al servicio de cursos.
2. Verifica las reglas de negocio: proceso abierto, sin repetir curso, máximo de créditos y sin cruces de horario.
3. Reserva la vacante en el **Durable Object** de esa sección (operación atómica).
4. Registra la matrícula en D1. Si falla, **libera la vacante** (compensación).
5. Publica el evento `MATRICULA_CONFIRMADA` en la cola y responde al alumno.

Las vacantes que se ven en pantalla salen de D1 con una sola consulta (modelo de lectura). El Durable Object solo se usa para escribir, que es donde se necesita la exclusión mutua.

### 5.5 Pagos
- **No confía en el monto que envía el navegador**: consulta la matrícula al servicio de matrícula y calcula el monto con su propia tarifa (S/ 50 por crédito).
- Cada matrícula se paga una sola vez y cada pago tiene un código de operación único.
- Si el servicio de matrícula no confirma el pago, el pago se revierte (compensación).

### 5.6 Notificaciones
- Consume la cola y genera avisos de matrícula confirmada, retiro y pago recibido.
- Es **idempotente**: cada evento tiene un id único y, si llega repetido, se ignora (la cola garantiza entrega «al menos una vez»).
- Si el servicio está caído, devuelve los mensajes a la cola para reintentarlos (hasta 30 veces). No se pierde ningún evento.

---

## 6. Funcionalidades por rol

### 6.1 Alumno
| Pantalla | Contenido |
|---|---|
| **Inicio** | Estado del proceso, créditos matriculados, monto pendiente de pago, notificaciones nuevas, horario semanal y una explicación de cómo funciona el sistema por dentro. |
| **Oferta de cursos** | Catálogo con búsqueda y filtro por ciclo, vacantes actualizadas cada 5 segundos, indicador del origen de los datos (caché KV o base D1) y avisos de cruce, límite de créditos o sección llena. |
| **Mi matrícula** | Tabla de cursos con horario, aula, créditos, monto y estado; botones de pagar y retirarse; horario semanal y constancia para imprimir. |
| **Pagos** | Historial de pagos con código de operación, método y monto. |
| **Notificaciones** | Avisos generados de forma asíncrona; se marcan como leídos al abrirlos. |

### 6.2 Administrador
| Pantalla | Contenido |
|---|---|
| **Panel general** | Indicadores de 4 servicios distintos (alumnos, matrículas, ocupación y recaudación), interruptor para abrir o cerrar la matrícula, ocupación por sección y alumnos por carrera. |
| **Cursos y secciones** | Crear y editar cursos y secciones, y activarlas o desactivarlas. Cada cambio invalida la caché. |
| **Matrículas** | Búsqueda y filtros por sección y estado; exportación a CSV. |
| **Alumnos** | Búsqueda y activación o desactivación de cuentas. |
| **Microservicios** | Diagrama de arquitectura con estado en vivo, tarjeta por servicio (estado, versión, latencia, recursos, interruptor «Simular caída»), simulador de concurrencia y flujo de eventos de la cola. |

### 6.3 Panel de trazas (ambos roles)
Desde el botón **Trazas** de la barra superior se abre un panel que muestra cada llamada a la API: qué microservicio respondió, el código de estado y el tiempo de cada salto. Por ejemplo, una matrícula real en producción mostró:

```
gateway 1729 ms
  matricula 1718 ms
    cursos 124 ms → D1 124 ms
    D1 128 ms · Durable Object 459 ms · D1 164 ms · cola 580 ms
```

Esto permite ver con datos reales que una sola acción del usuario atraviesa varios microservicios y tipos de almacenamiento.

---

## 7. Reglas de negocio

| Regla | Dónde se aplica | Respuesta |
|---|---|---|
| El proceso de matrícula debe estar abierto | matricula | 423 «El proceso de matrícula está cerrado» |
| Máximo 22 créditos por periodo | matricula | 409 indicando los créditos resultantes |
| Sin cruces de horario | matricula | 409 «Cruce de horario con …» |
| Una sola sección por curso | matricula + restricción `UNIQUE` en D1 | 409 «Ya estás matriculado en …» |
| No superar la capacidad de la sección | Durable Object de la sección | 409 «La sección ya no tiene vacantes» |
| No retirarse de un curso pagado | matricula | 409 |
| Pagar una sola vez cada matrícula | pagos + `UNIQUE` en D1 | 409 «Esta matrícula ya fue pagada» |

La web también muestra estas restricciones antes de enviar la petición, pero la **decisión final siempre la toma el servidor**.

---

## 8. Seguridad

| Medida | Protege contra |
|---|---|
| Sesión JWT firmada (HS256) en cookie `HttpOnly` | Robo del token mediante JavaScript malicioso (XSS) |
| Cookie `SameSite=Strict` y verificación de origen | Peticiones falsificadas desde otros sitios (CSRF) |
| Secreto `JWT_SECRET` guardado como secreto de Cloudflare | Exposición de la clave en el código |
| Contraseñas con PBKDF2-SHA256, sal aleatoria y comparación en tiempo constante | Filtración de contraseñas y ataques de tiempo |
| Límite de intentos de login por IP | Ataques de fuerza bruta |
| El gateway descarta las cabeceras de identidad del cliente | Suplantación de usuario o de rol |
| Autorización por rol dentro de cada servicio | Acceso de alumnos a funciones de administrador |
| Servicios internos sin URL pública (`workers_dev = false`) | Acceso directo saltándose el gateway |
| Consultas SQL parametrizadas | Inyección SQL |
| CSP, X-Frame-Options, nosniff, Referrer-Policy | Inyección de scripts, clickjacking |
| Montos calculados en el servidor | Manipulación de precios desde el navegador |

Todas estas protecciones se comprobaron en la prueba automática. Por ejemplo, un alumno que envía la cabecera `X-Usuario-Rol: admin` recibe 403, y las rutas internas responden 404 desde fuera.

---

## 9. Escalabilidad y balanceo de carga

### 9.1 Independencia de cada microservicio
| Aspecto | Cómo se cumple |
|---|---|
| **Código** | Cada servicio tiene su carpeta, su `src/` y su `wrangler.toml` |
| **Despliegue** | `npx wrangler deploy -c <servicio>/wrangler.toml` actualiza solo ese servicio |
| **Datos** | Cada servicio tiene su propia base D1; ninguno lee la base de otro |
| **Fallos** | Comprobado: con pagos caído, la matrícula sigue funcionando |
| **Versión** | Cada servicio informa su versión en el monitor |

### 9.2 Escalamiento horizontal
Cloudflare crea automáticamente más instancias de cada Worker según su propia demanda y en varios centros de datos a la vez. El día de matrícula, *cursos* y *matrícula* pueden tener muchas instancias mientras *pagos* y *estudiantes* usan pocas. No hay que reservar servidores ni configurar cuántas copias existen.

| Componente | Cómo escala |
|---|---|
| **Workers (los 6 servicios)** | Horizontal y automático, cada uno por separado |
| **KV (caché del catálogo)** | Replicado globalmente; descarga a la base de datos |
| **Queues** | Cloudflare aumenta los consumidores si se acumulan mensajes |
| **D1 (bases de datos)** | Cada base es una sola base SQLite; no escala como los Workers. Se mitiga con la caché KV y consultas agregadas |
| **Durable Objects** | Una instancia por sección, a propósito, para evitar el sobrecupo. Escala por secciones: cada sección puede estar en una máquina distinta |

### 9.3 Balanceo de carga
No hace falta configurar un balanceador: la plataforma lo incluye. La URL responde desde más de 300 centros de datos mediante **Anycast** (cada usuario entra por el más cercano) y Cloudflare reparte las peticiones entre las instancias de cada Worker. En local (`npm run dev`) no hay balanceo, porque todo corre en un solo proceso.

> El producto «Load Balancing» de Cloudflare (de pago) sirve para repartir tráfico entre servidores propios. Este sistema no tiene servidores propios, por lo que no lo necesita.

---

## 10. Tolerancia a fallos

Desde la página **Microservicios**, el administrador puede «apagar» cualquier servicio. El servicio responde 503 a todo hasta que se vuelve a encender. El efecto observado es:

| Servicio caído | Qué deja de funcionar | Qué sigue funcionando |
|---|---|---|
| **estudiantes** | Iniciar sesión y registrarse | Todo lo demás para quien ya tiene sesión (el gateway valida el JWT sin consultar a este servicio) |
| **cursos** | Ver la oferta y matricularse | Mi matrícula, pagos, notificaciones |
| **matricula** | Matricularse, retirarse y pagar | Catálogo y notificaciones |
| **pagos** | Pagar | Catálogo y matrícula (queda «pendiente de pago») |
| **notificaciones** | Ver avisos nuevos | Todo lo demás. Los eventos esperan en la cola y llegan al recuperarse |

La interfaz muestra cada error en su propio bloque e indica que los demás módulos siguen funcionando. En el panel del administrador, si un servicio cae, solo su indicador muestra el error.

---

## 11. Observabilidad

- **X-Request-Id:** identificador único por petición, propagado a todos los servicios que participan.
- **Server-Timing:** cabecera estándar con el tiempo de cada salto (gateway, servicio, KV, D1, Durable Object, cola). La web la usa para dibujar el panel de trazas.
- **Logs estructurados en JSON:** servicio, ruta, estado, duración y usuario. Se consultan en Workers Logs (activado en cada `wrangler.toml`).
- **Monitor de salud:** estado, versión, latencia y tiempo de respuesta de la base de datos de cada servicio, actualizado cada 5 segundos.
- **Flujo de eventos:** cada evento procesado guarda su origen, latencia de la cola y número de intentos.

---

## 12. Frontend: buenas prácticas aplicadas

| Práctica | Implementación |
|---|---|
| **Organización por capas** | `api/` (cliente HTTP), `sesion/` (contexto), `hooks/`, `componentes/`, `paginas/alumno` y `paginas/admin` |
| **Rutas protegidas por rol** | Un alumno no puede abrir pantallas de administrador y viceversa |
| **Carga diferida (code splitting)** | Cada pantalla se descarga solo cuando se necesita |
| **Componentes reutilizables** | Botón, tarjeta, indicador, modal, alerta, tabla, interruptor, barra de progreso |
| **Estados de carga, vacío y error** | Cada bloque maneja su propio estado; un servicio caído no rompe la pantalla |
| **Consultas periódicas eficientes** | Solo se refresca cuando la pestaña está visible; las búsquedas esperan a que el usuario deje de escribir |
| **Accesibilidad** | Etiquetas en formularios, roles ARIA, foco visible, enlace «saltar al contenido», respeto a «reducir movimiento» |
| **Diseño responsive** | Menú lateral plegable en móviles, tablas con desplazamiento, rejillas adaptables |
| **Modo oscuro** | Automático según la preferencia del sistema operativo |
| **Sistema de diseño** | Variables de color y espaciado, color granate institucional, un color por microservicio |
| **Impresión** | La constancia de matrícula se imprime sin menús ni botones |
| **Formatos locales** | Moneda en soles (S/) y fechas en hora de Lima |

---

## 13. Modelo de datos

Cada servicio tiene su propia base. Las migraciones solo avanzan: la versión 1 está en `0001_inicial.sql` y la versión 2 en `0002_*.sql`. Una migración ya aplicada nunca se edita.

| Base de datos | Tablas principales |
|---|---|
| `estudiantes-db` | **usuarios** (email, password_hash, nombre, rol, código, carrera, activo) |
| `cursos-db` | **cursos** (código, nombre, créditos, ciclo, área) · **secciones** (docente, días, hora de inicio y fin, aula, capacidad, activa) |
| `matricula-db` | **matriculas** (alumno, periodo, sección, curso, créditos, horario, estado) con restricción única (alumno, periodo, curso) |
| `pagos-db` | **pagos** (matrícula única, monto, método, código de operación, estado) |
| `notificaciones-db` | **eventos** (id único, tipo, origen, latencia, intentos) · **notificaciones** (título, mensaje, leída) |
| Durable Object `SeccionDO` | **inscritos** (email, fecha), una base SQLite por cada sección y periodo |

Además, cada base tiene la tabla `ajustes_servicio`, que guarda el estado de «caída simulada» y, en matrícula, si el proceso está abierto.

---

## 14. Despliegue

### 14.1 Comandos
```bash
npm install
npm run db:local     # bases locales y secreto de sesión local (primera vez)
npm run dev          # levanta los 6 Workers en http://localhost:8787
npm run desplegar    # despliega todo en Cloudflare
```

### 14.2 Qué hace `npm run desplegar`
1. Verifica la sesión de Cloudflare o abre el navegador para iniciarla.
2. Crea la cola `matricula-eventos` si no existe.
3. Compila la aplicación React dentro del gateway.
4. Despliega los 6 Workers en orden de dependencias: estudiantes → cursos → notificaciones → matricula → pagos → gateway. La primera vez se crean solas las bases D1 y la caché KV.
5. Crea el secreto `JWT_SECRET` del gateway si aún no existe.
6. Aplica las migraciones pendientes en las 5 bases de datos.

### 14.3 Problemas encontrados y cómo se resolvieron
| Problema | Causa | Solución |
|---|---|---|
| Windows bloqueó `@rollup/rollup-win32-x64-msvc` | La política «Application Control» impide ejecutar ese binario nativo | Override en `package.json` hacia `@rollup/wasm-node` (sin binario nativo). No se desactivó ninguna protección de Windows. |
| Error 10063 al desplegar notificaciones | La cuenta aún no tenía subdominio `workers.dev`, necesario para conectar la cola | Abrir «Workers & Pages» en el panel de Cloudflare, que crea el subdominio automáticamente. |
| El error de Rollup volvió tras instalar una dependencia | npm reinstaló el paquete nativo en `node_modules` | Borrar `node_modules/rollup` y ejecutar `npm install` para respetar el lockfile. |

---

## 15. Pruebas

Se escribió una prueba automática de punta a punta con **39 verificaciones** que recorre el sistema como lo haría un usuario real. Se ejecutó primero en local y después contra la URL de producción. **Pasó completa en ambos entornos.**

| Grupo | Qué verifica |
|---|---|
| **Sesión** | Sin sesión → 401; contraseña incorrecta → 401; registro, login y logout |
| **Caché** | Primera lectura desde D1, segunda desde KV; cabecera Server-Timing presente |
| **Reglas de negocio** | Matrícula correcta; cruce de horario, curso repetido y sección inexistente rechazados |
| **Pagos** | Monto calculado en el servidor (5 créditos × S/ 50 = S/ 250); pago duplicado rechazado; matrícula marcada como pagada; no se puede retirar de un curso pagado |
| **Seguridad** | Alumno sin acceso a administración; cabecera de rol falsificada ignorada; rutas internas no expuestas |
| **Administración** | Los 8 endpoints de administración responden; los 5 servicios reportan estado operativo |
| **Tolerancia a fallos** | Con pagos caído responde 503, pero matricularse sigue funcionando |
| **Concurrencia** | 120 reservas simultáneas en una sección de 5 vacantes |
| **Cola** | Las notificaciones llegan de forma asíncrona |

### 15.1 Resultados destacados en producción
| Medición | Resultado |
|---|---|
| Reservas simultáneas (capacidad 5) | **5 aceptadas, 115 rechazadas, sobrecupo 0** |
| Catálogo desde D1 (caché vacía) | 461 ms en el servicio de cursos |
| Catálogo desde KV (caché llena) | **3 ms** en el servicio de cursos |
| Verificaciones superadas | **39 de 39** en local y 39 de 39 en producción |

---

## 16. Guion de demostración

1. **Trazas:** iniciar sesión como alumno, abrir el panel «Trazas» y tocar una fila para ver el recorrido por los microservicios.
2. **Caché:** en Oferta de cursos, ver que el indicador cambia de «Desde base de datos D1» a «Desde caché KV».
3. **Reglas:** intentar matricularse en dos cursos con horario cruzado y ver el rechazo.
4. **Cola:** matricularse y abrir Notificaciones; el aviso llega segundos después.
5. **Concurrencia:** como administrador, en Microservicios, ejecutar el simulador con 300 alumnos y ver que no hay sobrecupo.
6. **Tolerancia a fallos:** apagar pagos y comprobar con el alumno que puede matricularse pero no pagar; volver a encenderlo.
7. **Cola resiliente:** apagar notificaciones, matricular a un alumno y volver a encenderlo; el evento llega con varios intentos.
8. **Despliegue independiente:** cambiar un texto en cursos y desplegar solo ese servicio.

> **Frase de cierre sugerida:** «Cada microservicio es un Worker independiente: se despliega solo, tiene su propia base de datos y Cloudflare lo escala horizontalmente según su propia demanda. El cuello de botella natural sería la base de datos; lo mitigamos con caché KV para las lecturas y con un Durable Object por sección para las escrituras concurrentes.»

---

## 17. Limitaciones y trabajo futuro

- **D1 no escala horizontalmente:** cada base es una sola instancia. Para un volumen mucho mayor se podrían activar réplicas de lectura o dividir los datos.
- **Pequeña ventana de inconsistencia:** si el Worker se detuviera justo después de reservar en el Durable Object y antes de escribir en D1, quedaría una vacante ocupada sin matrícula. Se podría añadir una tarea periódica de conciliación.
- **Límite de intentos de login por instancia:** es básico. Para producción conviene el Rate Limiting de Cloudflare.
- **Dependencias síncronas:** matrícula depende de cursos y pagos de matrícula. Se podría reducir con una copia local del catálogo actualizada por eventos.
- **Cuentas de demostración públicas:** las credenciales aparecen en la pantalla de login. Para un uso real deben cambiarse o desactivarse.
- **Datos de prueba en producción:** la prueba automática dejó en producción el alumno «Prueba Automática», con matrículas en Química I (pagada) y Física I.
- **Pasarela de pagos simulada:** siempre aprueba. Un sistema real se integraría con una pasarela externa.

---

## Anexos

### Anexo A. Cuentas de demostración
| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@uni.edu.pe` | `Admin2026!` |
| Alumno | `alumno@uni.edu.pe` | `Alumno2026!` |
| Alumna | `alumna@uni.edu.pe` | `Alumno2026!` |

### Anexo B. Estructura del proyecto
```
matricula-cloudflare/
├── compartido/        librería común (middleware, trazas, seguridad)
├── gateway/           API Gateway + web compilada (public/)
├── estudiantes/       src/ · migrations/ · wrangler.toml
├── cursos/
├── matricula/         src/seccion-do.js (Durable Object)
├── pagos/
├── notificaciones/
├── web/               React: api/ sesion/ hooks/ componentes/ paginas/
└── scripts/           db-local.mjs · deploy.mjs
```

### Anexo C. Principales rutas de la API
| Ruta | Servicio | Rol |
|---|---|---|
| `POST /api/auth/login` · `/registro` · `/logout` | gateway → estudiantes | Público |
| `GET /api/cursos` | cursos | Alumno / admin |
| `POST /api/cursos` · `PUT /api/secciones/:id` | cursos | Admin |
| `GET /api/vacantes` | matricula | Alumno / admin |
| `POST /api/matriculas` · `DELETE /api/matriculas/:id` | matricula | Alumno |
| `GET` · `PUT /api/matriculas/proceso` | matricula | Lectura: ambos · cambio: admin |
| `POST /api/matriculas/simulaciones` | matricula | Admin |
| `POST /api/pagos` · `GET /api/pagos/mios` | pagos | Alumno |
| `GET /api/notificaciones/mias` | notificaciones | Alumno |
| `GET /api/notificaciones/eventos` | notificaciones | Admin |
| `GET /api/sistema/servicios` · `PUT …/caida` | gateway | Admin |
