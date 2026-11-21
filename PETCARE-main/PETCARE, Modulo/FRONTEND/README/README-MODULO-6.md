# PetCare — Módulo 6: Vacunas (usuario)

## Archivos del módulo

- `vacunas.html`: página del carnet digital de vacunación.
- `css/vacunas.css`: estilos responsive para contadores, filtros, alerta amarilla, tabla y detalle expandible.
- `js/vacunas.js`: protección por rol, carga de mascotas, filtros, contadores, alerta de próximas dosis y detalle en solo lectura.
- `js/api.js`: se añade/documenta `api.vacunas.listarCarnet` para `GET /api/vacunas` con filtros opcionales.

## Comportamiento

- Solo permite el acceso al rol `usuario`, validando `GET /api/sesion` mediante `protegerPagina`.
- La barra lateral y superior son las del layout compartido (`montarLayout`).
- El selector de mascota se alimenta de `GET /api/mascotas?activa=true`.
- El carnet se consulta desde `GET /api/vacunas`, pasando `mascota_id` cuando se elige una mascota concreta.
- El endpoint admite también el parámetro opcional `estado`. La pantalla descarga los estados de la mascota seleccionada sin enviar ese filtro para poder mostrar contadores simultáneos de las tres categorías; las pastillas filtran la tabla en el cliente.
- Los contadores se calculan sobre todas las aplicaciones recibidas para la selección actual: `al_dia`, `proxima` y `pendiente`.
- La vista de base de datos descrita en el esquema previo utiliza `v_vacunaciones_estado`, con los estados `al_dia`, `proxima` y `vencida`. Para la interfaz, `vencida` se presenta como **Pendiente**. También se acepta `pendiente` cuando el backend devuelva esa etiqueta.
- La alerta amarilla muestra únicamente las dosis con estado próximo, fecha de próxima dosis válida y días restantes no negativos. Usa `dias_para_proxima` si el servidor lo entrega; si no, calcula los días naturales a partir de `proxima_dosis`.
- Al activar una fila se muestran veterinaria, veterinario, lote y observaciones/notas.
- No hay formularios ni botones para crear, editar, eliminar o marcar vacunas. El registro de vacunaciones corresponde al administrador.
- El contenido recibido del servidor se inserta con creación de nodos y `textContent`; no se utiliza `innerHTML`.
- Se contemplan carga, error, reintento, carnet vacío, ausencia de mascotas y filtros sin coincidencias.

## Endpoints del servidor

### 1. `GET /api/sesion`

- Petición: sin cuerpo; la cookie de sesión se envía automáticamente.
- Respuesta esperada: `{ usuario: { id, nombre_completo, rol, ... }, notificaciones_sin_leer? }`.
- Autorización: sesión válida y usuario activo. Solo rol `usuario` puede usar esta página.

### 2. `GET /api/mascotas?activa=true`

- Petición: sin cuerpo; query `activa=true`.
- Respuesta esperada: `{ datos: [{ id, nombre, activa, ... }] }`.
- El servidor solo devuelve mascotas que pertenecen al usuario autenticado.

### 3. `GET /api/vacunas?mascota_id={id}&estado={estado}`

- Petición: sin cuerpo. Ambos parámetros son opcionales.
- `mascota_id`: filtra el carnet por una mascota del usuario autenticado.
- `estado`: filtro opcional. Valores reconocidos por el frontend: `al_dia`, `proxima`, `vencida` o `pendiente`.
- Respuesta esperada: `{ datos: [{ id, mascota_id, nombre_mascota, vacuna_id, nombre_vacuna, fecha_aplicacion, proxima_dosis, estado, dias_para_proxima, nombre_veterinaria, nombre_veterinario, lote, notas }] }`.
- `id`, `mascota_id`, `vacuna_id`, `fecha_aplicacion`, `proxima_dosis`, `lote` y `notas` proceden de `VACUNACIONES` y sus claves relacionadas.
- `nombre_mascota`, `nombre_vacuna`, `nombre_veterinaria` y `nombre_veterinario` son alias de presentación obtenidos mediante joins; no son columnas nuevas.
- `estado` y `dias_para_proxima` son valores calculados por la vista/consulta de estado; no son nuevas columnas de `VACUNACIONES`.
- El servidor debe filtrar siempre por la sesión autenticada, incluso cuando no se indique `mascota_id`. No debe confiar en el identificador enviado por el navegador como prueba de propiedad.

### Errores

El servidor debe responder con `{ error, campos }`. El cliente conserva el error y muestra el mensaje en la región afectada. Las peticiones usan la cookie del mismo origen (`credentials: same-origin`); no se guardan tokens en `localStorage`.

## Relación con el esquema MySQL

La información se deriva de `VACUNACIONES`, `VACUNAS`, `MASCOTAS`, `VETERINARIAS` y `VETERINARIOS`. El esquema compartido anteriormente nombra la vista `v_vacunaciones_estado`; la descripción de este módulo la llama `vista_carnet_vacunas`. Se conserva el nombre del esquema existente (`v_vacunaciones_estado`) y no se crea otra vista desde el frontend. Si el nombre real del objeto SQL cambia, debe actualizarse la consulta en FastAPI.

`estado = vencida` se muestra con la etiqueta **Pendiente** en la interfaz para ajustarse al vocabulario solicitado por este módulo. `estado = proxima` se muestra como **Próxima** y `estado = al_dia` como **Al día**.

## Verificación

- Comprobación sintáctica de módulos JavaScript.
- HTML verificado para IDs únicos y referencias locales.
- CSS comprobado para llaves balanceadas.
- No se han agregado datos de demostración ni nuevas tablas/columnas.
- No se realizaron pruebas reales contra FastAPI/MySQL; el backend debe implementar el contrato indicado.
