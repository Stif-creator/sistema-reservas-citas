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

Home muestra servicios reales activos y públicos. Reservas en línea y calendario siguen pendientes; no se simulan confirmaciones ni disponibilidad. Tampoco se muestran accesos sociales sin implementar.

Los profesionales nuevos quedan con membresía `pending` y perfil `isActive: false`. El dueño los aprueba desde **Profesionales → Activar**. Activar/desactivar actualiza perfil y membresía juntos, y el acceso se actualiza en la sesión abierta. Los clientes se registran directamente en el negocio seleccionado.

## Firebase: configuración pendiente en el proyecto real

Se incluyen `firestore.rules`, `firestore.indexes.json` y `firebase.json`. Las reglas y recorridos se comprueban contra un proyecto local `demo-citaspro`; **las pruebas no publican reglas ni modifican Firebase real**.

Antes de usar estos cambios con datos reales, compara las reglas con las que tenga tu proyecto y aplica ambas configuraciones al proyecto correcto:

```sh
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project TU_PROJECT_ID
```

Espera a que los índices terminen de construirse. Las reglas anteriores pueden rechazar la nueva aprobación de profesionales o las consultas públicas hasta que se actualicen.

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

La suite cubre horarios vacíos/superpuestos, zonas horarias, contraste, aislamiento de negocios, permisos de clientes y profesionales, registro de los tres roles, cambio de colores, aprobación/revocación y navegación responsive.

La auditoría de dependencias de producción no reportó vulnerabilidades durante la implementación. La CLI de Firebase añadida para pruebas tiene avisos moderados en dependencias de desarrollo; no se aplicaron cambios de versión incompatibles para ocultarlos. Revisa `npm audit` al actualizar las herramientas.

Para desarrollo manual con emuladores, inicia `npx firebase emulators:start --only auth,firestore --project demo-citaspro` y configura `VITE_USE_FIREBASE_EMULATORS=true` y `VITE_FIREBASE_PROJECT_ID=demo-citaspro` en el entorno de Vite. La conexión a emuladores solo se habilita en desarrollo.
