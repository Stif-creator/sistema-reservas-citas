# CitasPro

Aplicación React + Vite con Firebase Authentication, Firestore y Firebase Hosting. El servidor de reservas funciona en Node.js (Render gratuito), con Cloud Functions como alternativa futura. Las imágenes se configuran mediante URLs; no se necesita Firebase Storage. Incluye páginas públicas por negocio, registro de clientes y profesionales, servicios, horarios, bloqueos, reservas y agenda.

## Desarrollo

1. Instala las dependencias con `npm install` y `npm install --prefix functions`. El servidor utiliza Node.js 22 y vive en `functions` para compartir su lógica con la alternativa Cloud Functions.
2. Copia `.env.example` a `.env` y completa la configuración de tu aplicación web de Firebase.
3. Habilita Email/Password en Firebase Authentication.
4. Ejecuta `npm run dev`. En PowerShell, si la política de scripts bloquea npm, usa `npm.cmd run dev`.

No subas `.env` al repositorio. Las variables `VITE_*` forman parte del cliente; nunca pongas credenciales de servidor en ellas.

## Identidad del negocio

**Nosotros y Contacto** son páginas independientes: `/b/:businessId/nosotros` y `/b/:businessId/contacto` en el portal, y `/cliente/nosotros` y `/cliente/contacto` dentro de la cuenta. Comparten layouts y los colores del negocio. Inicio ya no incluye esas secciones. En **Configuración → Página Nosotros** el administrador edita el título, historia, misión y valores; el guardado se refleja en tiempo real en las páginas abiertas.

El formulario de Contacto prepara un mensaje con nombre, correo, teléfono opcional, asunto y texto. El visitante termina el envío en su aplicación de correo o WhatsApp, usando los canales configurados por el administrador. No simula un envío, no almacena mensajes y no necesita cambios en Render. Si no hay correo ni WhatsApp configurados, informa de ello y deshabilita la preparación. El directorio general permite elegir un negocio antes de contactarlo.

Para estos cambios de interfaz, `npm run dev` los muestra localmente; para la web publicada, ejecuta `npm run build` y `npx firebase deploy --only hosting --project sistema-reservas-jf745-2026`. El nuevo campo `about` requiere publicar también las reglas de Firestore una vez. Los cambios posteriores de texto realizados desde Configuración se guardan directamente en Firestore y no requieren recompilar, subir a GitHub ni desplegar Render.

- `/`: directorio de negocios públicos.
- `/login`, `/registro` (también `/register`): acceso general.
- `/crear-negocio`: registro de un dueño y su nuevo negocio.
- `/b/:businessId`: página pública del negocio.
- `/b/:businessId/login` y `/b/:businessId/registro`: acceso con su identidad visual.

En **Configuración**, el dueño puede modificar `appearance.primaryColor`, `appearance.secondaryColor`, logo, portada, descripción y contacto. Allí aparece el enlace para compartir. Las tres páginas usan la misma identidad; si no hay portada se muestra una ilustración de calendario. El texto de los botones se adapta al contraste del color elegido. El panel administrativo conserva su diseño.

Home muestra servicios reales activos y públicos. La reserva del Sprint 2 se realiza dentro del panel del cliente autenticado. La reserva directamente desde el portal público corresponde a HU-16 (Sprint 3) y sigue pendiente.

Los profesionales que se registran por su cuenta quedan con membresía `pending` y perfil `isActive: false`. El administrador los aprueba desde **Profesionales → Activar** o **Usuarios**. Los clientes se registran directamente en el negocio seleccionado.

## Sprint 1

- **Usuarios (`/usuarios`):** el administrador cambia los roles Administrador, Profesional y Cliente y activa/desactiva el acceso al negocio. Los permisos están definidos por rol y se aplican tanto en las rutas como en Firestore. La cuenta del propietario y la cuenta del administrador que realiza el cambio están protegidas. El estado de acceso es `memberships.status`; no se elimina ni deshabilita globalmente la cuenta de Firebase Authentication. Los cambios se reflejan en las sesiones abiertas.
- **Profesionales (`/profesionales`):** el administrador registra una cuenta con nombre, apellido, correo, teléfono y contraseña inicial sin cerrar su sesión. Se usa una instancia separada de Authentication con persistencia solo en memoria. El perfil, la membresía activa y el usuario se guardan en una operación atómica. Si falla el guardado, se intenta eliminar la cuenta recién creada; si falla esa limpieza, se informa que necesita recuperación. Los correos existentes se rechazan sin modificar su cuenta. Luego se asignan servicios y horarios desde **Editar**. Funciona también con negocios que tienen la página pública desactivada.
- **Cambios de rol:** al convertir a un cliente en profesional se crea su perfil; al quitar el rol profesional se desactiva el perfil conservando sus servicios y horarios para una eventual reactivación. La actualización de rol, estado y perfil se realiza en una transacción. Activar/desactivar desde Profesionales también actualiza la membresía junto con el perfil.
- **Configuración y servicios:** se guardan los datos del negocio, categorías, servicios con precio y duración, y horarios semanales por día del negocio y del profesional.
- **Bloqueos y disponibilidad (`/bloqueos`, `/disponibilidad`):** los administradores consultan cualquier profesional del negocio; los profesionales consultan únicamente su propia disponibilidad. El cálculo cruza los horarios semanales, vigencia, duración, márgenes, zona horaria y límites de anticipación del negocio. Excluye bloqueos individuales y generales, incluso de varios días. Crear o eliminar un bloqueo actualiza la consulta abierta. No expone motivos de bloqueos ni perfiles privados a visitantes o clientes.

La consulta de disponibilidad permite verificar HU-6 y también excluye las citas ocupadas. El logo se configura mediante URL.

## Sprint 2 — Reservas y agenda

La [verificación contra el documento original](docs/sprint-2-verificacion.md) relaciona cada criterio de HU-7 a HU-12 con su implementación y pruebas, y detalla lo pendiente para la entrega publicada.

Al iniciar sesión o registrarse como **Cliente**, `/dashboard` redirige a `/cliente`. Administradores y profesionales conservan su panel. El Sprint 2 puede publicarse sin Blaze usando Render para la API y Firebase Spark para datos, cuentas y Hosting, dentro de sus cuotas gratuitas. **Todavía es necesario configurar y publicar el servidor y las reglas antes de activar las reservas reales.** `VITE_BOOKING_ENABLED` permanece desactivado por defecto; `.env` no se modifica automáticamente.

| Historia | Implementación |
| --- | --- |
| HU-7 | Disponibilidad calculada en servidor con horarios, vigencia, duración, márgenes, zona horaria, anticipación, bloqueos y reservas. |
| HU-8 | Selección de servicio, profesional, fecha y hora, resumen y guardado asociado al cliente autenticado; la respuesta distingue solicitud pendiente de cita confirmada. |
| HU-9 | Agenda administrativa con vistas de día, semana y mes, navegación por fechas y filtro de profesional. |
| HU-10 | Administrador o profesional asignado puede confirmar, finalizar, cancelar o marcar no asistida; el servidor valida las transiciones y fechas. |
| HU-11 | Cancelación y reprogramación de citas propias; se vuelve a comprobar el nuevo horario dentro de la transacción. Si falla, se conserva la cita anterior. |
| HU-12 | Reserva manual del administrador para un cliente existente o un contacto sin cuenta; no se crea una cuenta de Authentication para el contacto. |

| Ruta | Vista |
| --- | --- |
| `/cliente` | Inicio con identidad del negocio, servicios destacados y contacto. |
| `/cliente/servicios` | Catálogo real con búsqueda y filtros por categoría. |
| `/cliente/servicios/:serviceId` | Imagen, descripción, precio y duración del servicio. |
| `/cliente/reservas` | Consulta de reservas propias existentes, filtros y estados vacíos. |
| `/cliente/reservas/:reservationId` | Detalle, cancelación y acceso a reprogramación de una reserva propia. |
| `/cliente/reservar` | Flujo compartido de selección y confirmación. Acepta `?servicio=ID`. |
| `/cliente/reservas/:reservationId/reprogramar` | Selección de un nuevo horario conservando servicio y profesional. |
| `/cliente/reserva-exitosa/:reservationId` | Resultado persistido: pendiente o confirmado según la política del negocio. |
| `/cliente/perfil` | Datos de la cuenta en modo consulta y envío del enlace para cambiar la contraseña. |
| `/reservas` y `/reservas/:reservationId` | Lista y gestión de reservas; los profesionales solo acceden a las asignadas. |
| `/reservas/nueva` | Reserva manual, exclusiva del administrador. |
| `/agenda` | Agenda de día, semana y mes, exclusiva del administrador. |

`ClientLayout` carga el negocio y su catálogo y aplica `appearance.primaryColor` y `appearance.secondaryColor` en tiempo real. `ClientAccountLayout` comparte el menú de cuenta entre reservas, detalle y perfil. `SiteHeader`, `SiteFooter` y `BusinessBrand` se reutilizan también en `PublicHomeLayout`; las vistas no repiten encabezados ni pies de página. El menú móvil es desplegable y los colores de texto se adaptan al contraste.

El catálogo solo muestra servicios activos y públicos del negocio de la membresía. El cliente puede consultarlo aunque el administrador desactive la página pública externa; las reglas habilitan únicamente la lectura del catálogo y categorías de su negocio, sin dar acceso a perfiles privados de profesionales ni a la administración. La consulta de reservas filtra por negocio y usuario autenticado. No se generan citas, valoraciones, profesionales o confirmaciones ficticias para completar la interfaz.

La referencia visual guía las tarjetas, la distribución y el menú de cuenta. `BookingFlow`, `BookingStepper`, `BookingSummary` y `ReservationActions` se comparten entre cliente y administración. La edición de perfil permanece fuera de este Sprint. Avisos, favoritos y reserva desde el portal externo corresponden al Sprint 3.

`tests/ui/client.spec.js` comprueba registro y redirección, filtros, aislamiento de citas, identidad en vivo, catálogo con página pública desactivada, navegación móvil y cierre de sesión. Genera capturas de las seis vistas a 1440 y 390 píxeles en `test-results/client-*.png`. Los datos usados en las pruebas se crean únicamente en los emuladores.

### Probar el Sprint 2 sin Blaze ni datos reales

```sh
npm install
npm install --prefix functions
npm run demo
```

Abre http://127.0.0.1:5173. Este comando inicia los emuladores Authentication y Firestore en `demo-citaspro`, la API Node.js en el puerto 3001 y la interfaz. Habilita las reservas solo para esa sesión local, sin credenciales privadas ni emulador de Functions. El proyecto empieza vacío: crea un negocio, configura horarios, crea un servicio, registra un profesional y asígnale servicio y horario. Luego registra una cuenta Cliente desde el enlace público del negocio. Las cuentas y datos del Firebase real no se copian al emulador. Detener la demostración descarta los datos locales.

### Garantías y políticas del guardado

La API `POST /booking` verifica el ID token de Firebase Authentication (incluyendo revocación y cuentas deshabilitadas) y usa su UID, nunca una identidad enviada en el formulario. La lógica compartida verifica membresía, calcula precio y duración desde Firestore y devuelve al cliente únicamente datos publicables de los profesionales. El navegador no puede escribir directamente `reservations`, `bookingLocks` ni `bookingRequests` con las reglas nuevas. `GET /health` permite comprobar que el proceso está activo; no comprueba las credenciales ni el acceso a Firestore.

Cada creación, reprogramación y cambio de estado lee y modifica `bookingLocks/{businessId}` en una transacción. Esto serializa las reservas del negocio, incluso cuando aún no existe una cita para el horario solicitado. Se usan intervalos con márgenes de preparación y limpieza; una cita que termina exactamente cuando comienza la siguiente no se cruza. Una clave de solicitud hace seguros los reintentos; una revisión de la reserva detecta cambios concurrentes. El cálculo puro de horarios se comparte entre navegador y servidor en `functions/shared`.

`business.settings` controla `timezone`, `bookingIntervalMinutes`, `minAdvanceMinutes`, `maxAdvanceDays`, `cancellationLimitHours` y `autoConfirmBookings`. Los negocios nuevos usan 15 minutos de intervalo, 60 minutos de anticipación mínima, 90 días máximos, 24 horas para cancelar/reprogramar y confirmación manual. Reprogramar vuelve a aplicar la política de confirmación y el precio/duración vigente; un cambio de precio durante el formulario exige revisar de nuevo la disponibilidad. Una cita solo puede finalizarse después de su fin y marcarse no asistida después de su inicio. Las reservas finalizadas, canceladas y no asistidas no admiten nuevos cambios.

La disponibilidad del cliente se actualiza al cambiar la selección, cada 15 segundos y al recuperar el foco; el guardado siempre la vuelve a validar. Crear un bloqueo no cancela automáticamente citas existentes. Las consultas del backend admiten hasta 2000 documentos por conjunto consultado; si se supera ese volumen, se detienen con un mensaje y requieren ampliar la estrategia de consulta/archivo. No se omiten citas silenciosamente.

### Publicar sin facturación: Render + Firebase Hosting

Repositorio: [Stif-creator/sistema-reservas-citas](https://github.com/Stif-creator/sistema-reservas-citas). Los archivos nuevos deben estar subidos a la rama que conectes: Render no puede desplegar cambios que solo existen en tu computadora. Esta preparación no realiza commits ni publica servicios automáticamente.

1. En Render, conecta el repositorio que contiene estos cambios y crea un **Web Service** gratuito. `render.yaml` también permite crearlo como Blueprint. Para configuración manual: Root Directory `functions`, Build Command `npm ci`, Start Command `node server.js`, Health Check Path `/health`, Node.js 22 (definido en `functions/package.json`). No se necesita disco ni base de datos en Render.
2. En Firebase → Configuración del proyecto → Cuentas de servicio, genera la clave privada del Admin SDK. En Render → Environment → **Secret Files**, crea `firebase-service-account.json` con ese JSON. No lo guardes en el repositorio ni en variables `VITE_*`. Render lo monta en `/etc/secrets/firebase-service-account.json`.
3. Configura estas variables **del servidor en Render**:

   ```dotenv
   NODE_ENV=production
   GCLOUD_PROJECT=sistema-reservas-jf745-2026
   GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-service-account.json
   ALLOWED_ORIGINS=https://sistema-reservas-jf745-2026.web.app,https://sistema-reservas-jf745-2026.firebaseapp.com
   ```

   Usa el ID real del proyecto y los dominios reales de Hosting, sin barra final; agrega el dominio personalizado si lo configuras. `PORT` lo asigna Render. No configures variables de emuladores en Render. Si usas Blueprint, agrega el Secret File y vuelve a desplegar antes de probar la API.
4. Despliega Render y comprueba `https://TU-SERVICIO.onrender.com/health`. Para probar contra Firebase real desde el frontend local, agrega también `http://localhost:5173` y/o `http://127.0.0.1:5173` a `ALLOWED_ORIGINS`. Un origen autorizado no sustituye la autenticación ni los permisos.
5. Configura el frontend en `.env` (conserva sus variables Firebase):

   ```dotenv
   VITE_BOOKING_ENABLED=true
   VITE_BOOKING_PROVIDER=http
   VITE_BOOKING_API_URL=https://TU-SERVICIO.onrender.com
   ```

6. Una vez operativo el servidor, publica reglas, índices y frontend **sin desplegar Functions**:

   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules,firestore:indexes --project sistema-reservas-jf745-2026
   npm run build
   npx firebase deploy --only hosting --project sistema-reservas-jf745-2026
   ```

   Usa Firebase Hosting clásico. Si es la primera publicación, habilita Hosting en la consola del proyecto. Comprueba los dominios en Authentication → Settings → Authorized domains. Espera a que los índices estén listos y prueba una reserva, su confirmación y cancelación con cuentas del mismo negocio. No ejecutes `firebase deploy` sin `--only`: el repositorio conserva la configuración opcional de Functions.

Render gratuito se suspende tras 15 minutos sin tráfico y puede tardar alrededor de un minuto en despertar. La interfaz espera hasta 120 segundos; si no recibe respuesta conserva la clave de la operación para poder reintentar sin duplicarla. Los planes gratuitos tienen cuotas y no garantizan disponibilidad continua. Referencias: [Render gratuito](https://render.com/docs/free), [configuración de Render](https://render.com/docs/blueprint-spec), [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) y [verificación de tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

Para ejecutar la API localmente contra Firebase real, copia `functions/.env.example` a `.env.server` en la ra?z, completa la ruta privada de credenciales y ejecuta `npm run server` en otra terminal. Configura `VITE_BOOKING_API_URL=http://localhost:3001` en el frontend. Esta modalidad sí utiliza datos reales; `npm run demo` es la alternativa aislada.

### Volver a Cloud Functions después de configurar Blaze

Cloud Functions requiere el plan Blaze para desplegarse; el uso de emuladores no lo requiere ([documentación oficial](https://firebase.google.com/docs/functions/get-started)). No se habilita facturación desde este repositorio. Después de configurar el plan en el proyecto correcto:

```sh
npx firebase deploy --only functions:booking --config firebase.production.json --project sistema-reservas-jf745-2026
npx firebase deploy --only firestore:rules --config firebase.production.json --project sistema-reservas-jf745-2026
```

Después configura `VITE_BOOKING_PROVIDER=functions` y `VITE_BOOKING_ENABLED=true`, recompila con `npm run build` y publica con `npx firebase deploy --only hosting --project sistema-reservas-jf745-2026`. `VITE_BOOKING_API_URL` se ignora en este modo. No hay que migrar documentos ni cuentas: ambos servidores usan `functions/booking.js`, el mismo proyecto y las mismas claves de idempotencia. Comprueba el flujo publicado antes de retirar Render. La función se ejecuta en `us-central1`, con un máximo de tres instancias. La activación del indicador por sí sola no publica el servidor ni protege las reglas antiguas.

## Firebase y compatibilidad de datos

Se incluyen `firestore.rules`, `firestore.indexes.json` y `firebase.json`. Las reglas y recorridos se comprueban contra un proyecto local `demo-citaspro`; **las pruebas no publican reglas ni modifican Firebase real**.

El proyecto existente `sistema-reservas-jf745-2026` contiene datos demo antiguos, como profesionales con IDs distintos del formato actual y documentos sin campo `id`. Las pantallas consultan el perfil por negocio y usuario y usan el ID real del documento. Al cambiar el rol o estado, la membresía conserva una referencia `professionalId` al perfil existente; no se duplican perfiles ni se pierden sus horarios. Las referencias a servicios eliminados se descartan al guardar una nueva asignación.

`firebase.json` y `firebase.production.json` usan el mismo archivo `firestore.rules`. Conserva las colecciones de fases posteriores y añade la protección de reservas del Sprint 2. Sigue el orden de publicación del servidor y las reglas indicado arriba. Editar el repositorio no publica cambios en el proyecto real.

La prueba `npm run test:rules:production` verifica la lectura de usuarios del mismo negocio, el rechazo de accesos ajenos y la edición de servicios antiguos. También forma parte de `npm run test:rules`. En Servicios se vuelve a leer el dato del servidor antes de confirmar la actualización de la tabla. El catálogo público recibe los cambios de servicios sin tener que recargar la página.

Para un proyecto con el modelo nuevo, compara las reglas con las que tenga tu proyecto y aplica ambas configuraciones al proyecto correcto:

```sh
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project TU_PROJECT_ID
```

Espera a que los índices terminen de construirse. Las reglas anteriores pueden rechazar el registro administrativo de profesionales, los cambios de rol, la consulta de disponibilidad o las consultas públicas hasta que se actualicen. Los cambios de este repositorio no despliegan automáticamente las reglas.

Las reglas permiten lectura pública de los documentos completos de negocios activos con `settings.publicPageEnabled: true` y de sus servicios activos/públicos. **`businesses` debe contener únicamente información publicable**; no almacenes secretos ni información privada en ese documento. Los perfiles de usuarios, clientes y profesionales no son públicos. Firestore autoriza documentos completos, no oculta campos de un documento permitido. Referencia: [condiciones y control de acceso de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).

La reversión de registros incompletos solo se permite durante los primeros diez minutos y antes de `onboardingComplete: true`. Los usuarios existentes sin ese campo se consideran ya registrados. Si una reversión falla, se conserva la cuenta y se informa que necesita recuperación; no se promete una eliminación inexistente.

Al alojar la web fuera de Firebase Hosting, configura una reescritura a `index.html` para que los enlaces `/b/...` funcionen al abrirlos directamente. `firebase.json` ya incluye esa reescritura para Hosting.

## Comprobaciones

```sh
npm run lint
npm run build
npm test
npm run test:rules
npm run test:booking
npm run test:http
npx playwright install chromium
npm run test:ui
```

Los emuladores requieren Java compatible con Firebase CLI y las dependencias de `functions` instaladas. Los puertos 8080, 9099, 3001 y 4173 deben estar disponibles (5173 para la demo). Las pruebas de navegador usan la API HTTP con tokens reales del emulador de Authentication y generan capturas de escritorio y móvil en `test-results/`, ignorado por Git. `test:http` comprueba autenticación, CORS, límites de entrada y respuestas de error sin datos internos.

La suite cubre horarios vacíos/superpuestos, zonas horarias, contraste, aislamiento de negocios, permisos de clientes y profesionales, registro de los tres roles, cambio de colores, aprobación/revocación y navegación responsive. También comprueba registro administrativo sin perder la sesión, correos duplicados, asignación de servicios y horarios, cambios de rol y estado en sesiones abiertas, protección del propietario y exclusión/restauración de franjas al crear/eliminar bloqueos.

`tests/booking.test.js` verifica concurrencia, reintentos, cruces, márgenes, permisos, estados, reservas manuales y reprogramaciones atómicas. `tests/ui/sprint2.spec.js` recorre la reserva del cliente, confirmación, reprogramación, cancelación, reserva manual, cambios por el profesional asignado y las tres vistas de agenda. Revisa `npm audit` y `npm audit --prefix functions` al actualizar dependencias.

La conexión a emuladores solo se habilita en desarrollo. `npm run demo` configura todas las variables necesarias sin editar `.env`.
