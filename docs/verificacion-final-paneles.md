# Verificación final de paneles

Fecha: 19 de octubre de 2026 (America/La_Paz).

Se repitió la verificación de los cambios locales de paneles, agenda, auditoría, formularios sin guardar y flujos del cliente. No se realizaron commits ni despliegues.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` | 17 pruebas aprobadas |
| `npm.cmd run test:http` | 14 pruebas aprobadas |
| Reglas y reservas en emuladores | 39 pruebas aprobadas |
| Playwright | 11 aprobadas en la ejecución completa; 3 pruebas dirigidas de cliente y superadministrador aprobadas tras el rediseño |
| `npm.cmd run lint` | Sin errores |
| `npm.cmd run build` | Compilación correcta en `dist` |
| `git diff --check` | Sin errores de espacios |

Los recorridos de navegador comprobaron que el superadministrador puede entrar y gestionar negocios sin una membresía de negocio; tras quitarle ese privilegio, el acceso queda limitado a la membresía activa que tenga. También se comprobaron el registro y las restricciones del administrador, los permisos del profesional, el cambio de rol y estado en vivo, y las vistas y reservas propias del cliente. La portada renovada del cliente presenta su próxima cita y catálogo con un tema derivado en vivo de `business.appearance` en Firestore; la edición de colores sigue reservada al superadministrador por negocio. Se validaron escritorio y móvil, el tema actualizado desde Firestore, fechas, búsqueda del siguiente día disponible, reserva sin preferencia, repetición de cita y descarga del calendario. Se reforzó la espera del avance entre pasos para comprobar que la selección de servicio muestra realmente la selección de profesional. La ejecución completa también comprobó reserva, reprogramación con respuesta perdida y reintento, cancelación, reserva manual, confirmación del profesional y agenda de día, semana y mes.

La apariencia admite `primaryColor`, `secondaryColor`, `accentColor` y `surfaceColor`. La vista previa refleja los cuatro valores, y el texto sobre los fondos de acento y superficie usa un color de contraste calculado. Las reglas de Firestore exigen los cuatro colores hexadecimales para actualizar `appearance` y solo permiten ese cambio al superadministrador. La prueba dirigida en navegador comprobó la edición, persistencia y bloqueo de los colores adicionales al revocar ese privilegio.

También se verificaron gestión de negocios, permisos, auditoría, formularios sin guardar, registro y aprobación de profesionales, horarios, bloqueos, favoritos y valoraciones. Las pruebas incluyen comprobaciones de ancho móvil; se revisaron capturas de configuración, gestión de negocios, agenda profesional y la reserva móvil del cliente.

Las pruebas utilizan el proyecto emulado `demo-citaspro`. Estos resultados no verifican la configuración ni el funcionamiento del despliegue real de Firebase, Render o Cloudinary.

## Repetir la verificación

Desde la raíz, con los puertos de los emuladores disponibles:

```powershell
npm.cmd test
npm.cmd run test:http
npm.cmd run lint
npm.cmd run build
npx.cmd firebase emulators:exec --only "auth,firestore" --project demo-citaspro "node --test --test-concurrency=1 tests/firestore.test.js tests/production-rules.test.js tests/booking.test.js && npx playwright test"
```

Si el puerto 8080 permanece ocupado después de cerrar Firebase, identifica primero el proceso. En esta revisión quedó un proceso Java del emulador de este proyecto y fue necesario detenerlo antes de reiniciar las pruebas.

## Ejecutar y publicar

Para probar localmente con emuladores:

```powershell
npm.cmd run demo
```

Abre `http://127.0.0.1:5173`. Consulta el README para preparar las cuentas y datos de demostración.

Para publicar los cambios de paneles y auditoría cuando el backend requerido ya esté actualizado:

```powershell
npm.cmd run build
npx.cmd firebase deploy --only "firestore:rules,hosting" --project sistema-reservas-jf745-2026
```

Las reglas deben acompañar a la interfaz para permitir el guardado con auditoría. Si todavía están pendientes las actualizaciones anteriores de reservas, cuentas o solicitudes de bloqueo, despliega primero el backend en Render según el README. No se ejecutaron estos comandos de publicación durante esta revisión.
