# CitasPro

Aplicación React + Vite con Firebase Authentication y Firestore. Incluye páginas públicas por negocio, registro de clientes y profesionales, administración de servicios, horarios y bloqueos.

## Desarrollo

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` a `.env` y completa la configuración de tu aplicación web de Firebase.
3. Habilita Email/Password en Firebase Authentication.
4. Ejecuta `npm run dev`. En PowerShell, si la política de scripts bloquea npm, usa `npm.cmd run dev`.

No subas `.env` al repositorio. Las variables `VITE_*` forman parte del cliente; nunca pongas credenciales de servidor en ellas.

## Identidad del negocio

- `/`: directorio de negocios públicos.
- `/login`, `/registro` (también `/register`): acceso general.
- `/crear-negocio`: registro de un dueño y su nuevo negocio.
- `/b/:businessId`: página pública del negocio.
- `/b/:businessId/login` y `/b/:businessId/registro`: acceso con su identidad visual.

En **Configuración**, el dueño puede modificar `appearance.primaryColor`, `appearance.secondaryColor`, logo, portada, descripción y contacto. Allí aparece el enlace para compartir. Las tres páginas usan la misma identidad; si no hay portada se muestra una ilustración de calendario. El texto de los botones se adapta al contraste del color elegido. El panel administrativo conserva su diseño.

Home muestra servicios reales activos y públicos. Reservas en línea y calendario siguen pendientes; no se simulan confirmaciones. Tampoco se muestran accesos sociales sin implementar.

Los profesionales que se registran por su cuenta quedan con membresía `pending` y perfil `isActive: false`. El administrador los aprueba desde **Profesionales → Activar** o **Usuarios**. Los clientes se registran directamente en el negocio seleccionado.

## Sprint 1

- **Usuarios (`/usuarios`):** el administrador cambia los roles Administrador, Profesional y Cliente y activa/desactiva el acceso al negocio. Los permisos están definidos por rol y se aplican tanto en las rutas como en Firestore. La cuenta del propietario y la cuenta del administrador que realiza el cambio están protegidas. El estado de acceso es `memberships.status`; no se elimina ni deshabilita globalmente la cuenta de Firebase Authentication. Los cambios se reflejan en las sesiones abiertas.
- **Profesionales (`/profesionales`):** el administrador registra una cuenta con nombre, apellido, correo, teléfono y contraseña inicial sin cerrar su sesión. Se usa una instancia separada de Authentication con persistencia solo en memoria. El perfil, la membresía activa y el usuario se guardan en una operación atómica. Si falla el guardado, se intenta eliminar la cuenta recién creada; si falla esa limpieza, se informa que necesita recuperación. Los correos existentes se rechazan sin modificar su cuenta. Luego se asignan servicios y horarios desde **Editar**. Funciona también con negocios que tienen la página pública desactivada.
- **Cambios de rol:** al convertir a un cliente en profesional se crea su perfil; al quitar el rol profesional se desactiva el perfil conservando sus servicios y horarios para una eventual reactivación. La actualización de rol, estado y perfil se realiza en una transacción. Activar/desactivar desde Profesionales también actualiza la membresía junto con el perfil.
- **Configuración y servicios:** se guardan los datos del negocio, categorías, servicios con precio y duración, y horarios semanales por día del negocio y del profesional.
- **Bloqueos y disponibilidad (`/bloqueos`, `/disponibilidad`):** los administradores consultan cualquier profesional del negocio; los profesionales consultan únicamente su propia disponibilidad. El cálculo cruza los horarios semanales, vigencia, duración, márgenes, zona horaria y límites de anticipación del negocio. Excluye bloqueos individuales y generales, incluso de varios días. Crear o eliminar un bloqueo actualiza la consulta abierta. No expone motivos de bloqueos ni perfiles privados a visitantes o clientes.

La consulta de disponibilidad permite verificar HU-6. El flujo de reserva, el cruce con citas y el control de reservas concurrentes corresponden al sprint 2 y todavía no están implementados. El logo se configura mediante URL.

## Sprint 2 — Primera parte: diseño del cliente

Al iniciar sesión o registrarse como **Cliente**, `/dashboard` redirige a `/cliente`. Administradores y profesionales conservan su panel. Esta entrega prepara la interfaz; todavía no permite crear, cancelar ni reprogramar citas.

| Ruta | Vista |
| --- | --- |
| `/cliente` | Inicio con identidad del negocio, servicios destacados y contacto. |
| `/cliente/servicios` | Catálogo real con búsqueda y filtros por categoría. |
| `/cliente/servicios/:serviceId` | Imagen, descripción, precio y duración del servicio. |
| `/cliente/reservas` | Consulta de reservas propias existentes, filtros y estados vacíos. |
| `/cliente/reservas/:reservationId` | Detalle de una reserva de la cuenta, en modo consulta. |
| `/cliente/perfil` | Datos de la cuenta en modo consulta y envío del enlace para cambiar la contraseña. |

`ClientLayout` carga el negocio y su catálogo y aplica `appearance.primaryColor` y `appearance.secondaryColor` en tiempo real. `ClientAccountLayout` comparte el menú de cuenta entre reservas, detalle y perfil. `SiteHeader`, `SiteFooter` y `BusinessBrand` se reutilizan también en `PublicHomeLayout`; las vistas no repiten encabezados ni pies de página. El menú móvil es desplegable y los colores de texto se adaptan al contraste.

El catálogo solo muestra servicios activos y públicos del negocio de la membresía. El cliente puede consultarlo aunque el administrador desactive la página pública externa; las reglas habilitan únicamente la lectura del catálogo y categorías de su negocio, sin dar acceso a perfiles privados de profesionales ni a la administración. La consulta de reservas filtra por negocio y usuario autenticado. No se generan citas, valoraciones, profesionales o confirmaciones ficticias para completar la interfaz.

La referencia visual guía las tarjetas, la distribución y el menú de cuenta. La selección de profesional/horario, confirmación, cancelación y reprogramación se conectarán en las siguientes partes de HU-7 a HU-12. La edición de perfil no está habilitada en esta primera parte. Los avisos y favoritos no aparecen como enlaces sin implementar; pertenecen al Sprint 3.

`tests/ui/client.spec.js` comprueba registro y redirección, filtros, aislamiento de citas, identidad en vivo, catálogo con página pública desactivada, navegación móvil y cierre de sesión. Genera capturas de las seis vistas a 1440 y 390 píxeles en `test-results/client-*.png`. Los datos usados en las pruebas se crean únicamente en los emuladores.

## Firebase y compatibilidad de datos

Se incluyen `firestore.rules`, `firestore.indexes.json` y `firebase.json`. Las reglas y recorridos se comprueban contra un proyecto local `demo-citaspro`; **las pruebas no publican reglas ni modifican Firebase real**.

El proyecto existente `sistema-reservas-jf745-2026` contiene datos demo antiguos, como profesionales con IDs distintos del formato actual y documentos sin campo `id`. Las pantallas consultan el perfil por negocio y usuario y usan el ID real del documento. Al cambiar el rol o estado, la membresía conserva una referencia `professionalId` al perfil existente; no se duplican perfiles ni se pierden sus horarios. Las referencias a servicios eliminados se descartan al guardar una nueva asignación.

`firebase.json` y `firebase.production.json` usan el mismo archivo `firestore.rules`. Incluye las reglas del sprint 1 y conserva las colecciones de fases posteriores que ya existían. Para publicar las reglas compatibles con el proyecto existente:

```sh
npx firebase deploy --only firestore:rules --config firebase.production.json --project sistema-reservas-jf745-2026
```

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
npx playwright install chromium
npm run test:ui
```

Los emuladores requieren Java compatible con Firebase CLI. Los puertos 8080, 9099 y 4173 deben estar disponibles. Las pruebas de navegador generan capturas de escritorio y móvil en `test-results/`, ignorado por Git.

La suite cubre horarios vacíos/superpuestos, zonas horarias, contraste, aislamiento de negocios, permisos de clientes y profesionales, registro de los tres roles, cambio de colores, aprobación/revocación y navegación responsive. También comprueba registro administrativo sin perder la sesión, correos duplicados, asignación de servicios y horarios, cambios de rol y estado en sesiones abiertas, protección del propietario y exclusión/restauración de franjas al crear/eliminar bloqueos.

La auditoría de dependencias de producción no reportó vulnerabilidades durante la implementación. La CLI de Firebase añadida para pruebas tiene avisos moderados en dependencias de desarrollo; no se aplicaron cambios de versión incompatibles para ocultarlos. Revisa `npm audit` al actualizar las herramientas.

Para desarrollo manual con emuladores, inicia `npx firebase emulators:start --only auth,firestore --project demo-citaspro` y configura `VITE_USE_FIREBASE_EMULATORS=true` y `VITE_FIREBASE_PROJECT_ID=demo-citaspro` en el entorno de Vite. La conexión a emuladores solo se habilita en desarrollo.
