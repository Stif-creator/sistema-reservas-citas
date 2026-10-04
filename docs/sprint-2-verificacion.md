# Verificación del Sprint 2

Referencia: «SISTEMA GENÉRICO DE GESTIÓN Y RESERVAS DE CITAS — Historias de Usuario y Backlog del Producto (Versión Corregida y Actualizada)», documento proporcionado por el propietario. El Sprint 2 comprende **HU-7 a HU-12, 26 puntos**. HU-13 a HU-25 corresponden al Sprint 3.

## Alcance implementado

| Historia | Criterio del documento | Implementación y comprobación |
| --- | --- | --- |
| HU-7 | Mostrar solo horarios sin cruces con reservas ni bloqueos. | Cálculo compartido de horarios, márgenes y zona horaria; el servidor consulta reservas y bloqueos y revalida al guardar. Pruebas de disponibilidad y backend. |
| HU-8 | Reservar desde el panel del cliente autenticado, asociado a su perfil y sin duplicar horarios. | `/cliente/reservar`, token verificado en la API, UID del cliente derivado de la sesión, transacción e idempotencia. Pruebas de concurrencia, permisos y flujo de navegador. |
| HU-9 | Agenda administrativa por día, semana y mes. | `/agenda` con las tres vistas, navegación y filtro de profesional. Prueba de navegador de las tres vistas con reservas reales del emulador. |
| HU-10 | Administrador o profesional puede confirmar, finalizar, cancelar o marcar no asistida. | Lista y detalle en `/reservas`, permisos del profesional asignado y transiciones validadas por servidor. Pruebas de backend de los cuatro estados y aislamiento entre usuarios. |
| HU-11 | Cancelar o reprogramar comprobando nuevamente disponibilidad. | Acciones en el detalle del cliente, reprogramación atómica y conservación del horario anterior si falla. Pruebas de conflictos, plazos, cancelación y recuperación ante pérdida de respuesta. |
| HU-12 | Registrar reservas manuales desde administración. | `/reservas/nueva` permite elegir cliente existente o registrar un contacto sin cuenta. Se aplican las mismas comprobaciones de disponibilidad. Pruebas de backend y navegador. |

## Correcciones de la revisión

- Una consulta de disponibilidad que tarda más de 15 segundos puede terminar sin que el sondeo automático la descarte e inicie otra. Cambiar servicio, profesional o fecha sí descarta la consulta anterior.
- Los cambios de revisión recibidos por Firestore no desmontan el formulario de reprogramación. Si el servidor guardó pero se perdió la respuesta HTTP, el reintento conserva exactamente la solicitud y su identificador, recuperando el resultado sin aplicar de nuevo el cambio.
- La prueba de navegador reproduce ambos casos: demora superior al intervalo de sondeo y respuesta perdida después de guardar una reprogramación.

## Verificación reproducible

Resultado de la revisión del **4 de octubre de 2026**: **37 pruebas aprobadas** (8 de lógica compartida, 22 de servidor y reglas, 1 de API HTTP y 6 de navegador), además de lint y compilación correctos. Los dos casos de regresión se ejecutan dentro del recorrido de navegador del Sprint 2.

```sh
npm test
npm run test:http
npm run test:booking
npm run test:rules
npm run test:ui
npm run lint
npm run build
```

Las pruebas utilizan únicamente emuladores. `npm run demo` permite revisar manualmente el flujo con datos temporales. El servidor de la demo es la misma API HTTP preparada para Render. Las pruebas de navegador comprueban también el tema del negocio y el diseño móvil.

## Pendiente para cerrar la entrega publicada

La implementación local no equivale a un despliegue terminado. Falta:

1. Subir los cambios al repositorio; no se hacen commits automáticamente.
2. Crear el servicio en Render, configurar la credencial privada de Firebase y los dominios autorizados de la API.
3. Publicar las reglas e índices de Firestore, configurar la URL de la API y habilitar las reservas en el frontend.
4. Compilar y publicar en Firebase Hosting; verificar allí una reserva, sus estados, reprogramación y cancelación con cuentas reales de prueba.

Las instrucciones están en [README](../README.md#publicar-sin-facturación-render--firebase-hosting). Firestore, Authentication e imágenes por URL se conservan. Cloud Functions sigue siendo una alternativa cuando se habilite Blaze; no requiere migrar los datos.
