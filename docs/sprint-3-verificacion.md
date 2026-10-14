# Sprint 3: implementación y verificación

Referencia: documento original «Sistema genérico de gestión y reservas de citas», HU-13 a HU-25 (44 puntos). Se mantiene Firebase Authentication, Firestore y Hosting; la API usa Render y las imágenes Cloudinary. No se incorpora facturación, pagos ni Blaze.

| Historia | Implementación |
| --- | --- |
| HU-13 | Mis reservas: próximas, anteriores y canceladas, con fecha, hora, servicio, profesional y estado. |
| HU-14 | `/agenda` también admite profesionales. La consulta y las reglas limitan las citas al profesional autenticado; muestra sus servicios asignados. |
| HU-15 | El portal `/b/:businessId` muestra datos, servicios y fichas públicas de profesionales. La API no expone teléfonos, usuarios, horarios internos ni clientes en el catálogo público. |
| HU-16 | `/b/:businessId/reservar` comparte `BookingFlow` con el panel. Selección sin sesión; acceso o registro al confirmar. Conserva la selección en esta pestaña por una hora y vuelve a consultar disponibilidad al regresar. La confirmación exige una cuenta cliente activa del negocio; sigue usando transacción, bloqueo e idempotencia. |
| HU-17 | Configuración permite latitud y longitud; Contacto muestra dirección y mapa OpenStreetMap. Si faltan coordenadas, informa que aún no se configuró el mapa, sin inventar una ubicación. |
| HU-18 | Dashboard administrativo muestra citas de hoy, próximas, clientes y conteos por estado, con enlaces al detalle. |
| HU-19 | Cada creación, reprogramación y estado crea avisos para cliente, profesional asignado y propietario dentro de la misma transacción. Campana con contador, listado y marcar leído. |
| HU-20 | `/clientes` permite buscar, editar contacto e inspeccionar historial. Los datos de contacto del negocio están separados de la identidad de acceso; no se cambia el correo de Firebase Authentication. |
| HU-21 | `/cliente/favoritos`: marcar/quitar servicios y profesionales, con persistencia y aislamiento por negocio y usuario. |
| HU-22 | Promociones y recordatorios permite anticipación entre 1 y 168 horas (24 por defecto). El aviso se guarda programado con la reserva; reprogramar actualiza su fecha y cancelar/finalizar lo retira. Cambiar la anticipación recalcula recordatorios de próximas citas existentes. |
| HU-23 | `/cliente/favoritos`: registrar o retirar interés por servicio, profesional y fecha. El flujo enlaza esta pantalla cuando no hay horarios. Registrar interés no ocupa una franja ni confirma una reserva. |
| HU-24 | El detalle de una cita finalizada permite valorar de 1 a 5 y escribir reseña pública. El servidor verifica propietario y estado; una reseña por reserva, actualizable. Se muestra nombre de pila, servicio, puntuación y comentario en el portal. |
| HU-25 | `/promociones`: crear, editar y desactivar descuentos de 1 a 90 %, servicio y fechas. El portal muestra las vigentes y la API aplica el mayor descuento, sin acumularlos. Valida el precio de nuevo al confirmar; una promoción expirada no altera citas ya guardadas. |

## Comportamiento y límites explícitos

- Los avisos son internos. La campana y el listado reciben cambios directamente de Firestore en tiempo real y actualizan vencimientos cada 30 segundos. Los recordatorios aparecen desde su anticipación hasta el inicio de la cita. No se envían correos, SMS ni notificaciones con el navegador cerrado.
- Clientes e historial, avisos y el selector de servicios de Promociones se consultan directamente en Firestore con las reglas del usuario. No dependen del arranque de Render. Las escrituras siguen pasando por la API. Las consultas HTTP reintentan errores temporales 502/503/504 dentro del límite de espera; las escrituras no se reenvían automáticamente.
- Los recordatorios se guardan con `visibleAt` y `expiresAt`: no requieren un cron de pago ni un servidor siempre encendido. Las citas anteriores a este cambio reciben recordatorio cuando se configura la anticipación o se modifican.
- El borrador público no reserva el horario. Tras el acceso, el usuario revisa y confirma nuevamente. Si el navegador no permite sessionStorage, debe repetir la selección.
- La cuenta debe pertenecer al negocio elegido. No se añadió un sistema de membresías múltiples automático.
- Las fechas de promociones usan días UTC, indicado en el formulario; se aplican según la vigencia al realizar la reserva, no según el día de atención.
- Las consultas del servidor mantienen el límite explícito de 2000 registros por conjunto. Superarlo muestra error; no se presenta un resumen parcial como si fuera completo.
- Los datos, cuentas y reservas reales no se modifican durante las pruebas.

## Pruebas

Verificado el 14 de octubre de 2026: **53 pruebas aprobadas** (8 de lógica compartida, 9 de HTTP e imágenes, 12 del servidor de reservas y Sprint 3, 17 de reglas y 7 recorridos de navegador), además de lint y compilación. Los seis recorridos previos pasaron en la suite completa; el recorrido nuevo se volvió a ejecutar y pasó después de corregir su selector de prueba. Se revisó también la captura móvil, sin desbordamiento horizontal.

`tests/booking.test.js` cubre canal público, autenticación final, colisiones, favoritos, espera, aislamiento de clientes, avisos atómicos, recordatorios, reseñas y descuentos. `tests/production-rules.test.js` rechaza escrituras directas falsificadas en colecciones del Sprint 3. `tests/booking-http.test.js` limita las operaciones sin token a las dos consultas públicas. `tests/ui/sprint3.spec.js` recorre portal, mapa, selección sin sesión, regreso del acceso, reserva, avisos, favoritos, espera, clientes, promociones, recordatorios, agenda profesional y móvil.

```sh
npm test
npm run test:http
npm run test:booking
npm run test:rules
npm run test:ui
npm run lint
npm run build
```

## Publicar después de revisar

1. Subir los cambios a GitHub y desplegar el nuevo commit en Render. No hacen falta nuevas credenciales ni variables para estas funciones.
2. Publicar reglas: `npx firebase deploy --only firestore:rules,firestore:indexes --project sistema-reservas-jf745-2026`. Las reglas nuevas impiden manipular directamente avisos, reseñas, favoritos, espera y promociones saltándose el servidor.
3. Compilar y publicar la interfaz: `npm run build` y `npx firebase deploy --only hosting --project sistema-reservas-jf745-2026`.
4. En Configuración, ingresar las coordenadas reales del local. En Promociones, configurar la anticipación de recordatorios y las ofertas que realmente se quieran publicar.
5. Comprobar el flujo publicado con cuentas de prueba del mismo negocio. `/health` solamente comprueba el proceso; no prueba todo el Sprint.

No se ejecutan commits ni despliegues automáticamente.
