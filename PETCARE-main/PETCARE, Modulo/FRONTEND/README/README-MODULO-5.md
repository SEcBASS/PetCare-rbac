# PetCare — Módulo 5: Citas (usuario)

## Archivos de este módulo

- `citas.html`: página de consulta de citas.
- `css/citas.css`: estilos responsive para lista y calendario mensual.
- `js/citas.js`: protección por rol, filtro, vistas, navegación mensual y renderizado seguro.
- `js/api.js`: se documenta `api.citas.listar` y se añade `api.citas.listarMes` para el endpoint mensual.

## Comportamiento

- Solo permite acceso al rol `usuario`, mediante `GET /api/sesion` y `protegerPagina`.
- La navegación lateral y superior se genera con `montarLayout` del Módulo 0.
- El filtro de mascotas se alimenta de `GET /api/mascotas?activa=true`.
- La vista Lista consulta `GET /api/citas` con el filtro `mascota_id` opcional y clasifica los resultados en próximas y pasadas usando la fecha y hora locales.
- La vista Mes consulta `GET /api/citas?mes=AAAA-MM&mascota_id={id}`. Los meses se solicitan nuevamente al navegar, y los días con citas se resaltan.
- Al seleccionar un día se muestran debajo las citas del mismo día, sin realizar otra petición.
- No existe formulario, botón ni llamada para agendar, editar o cancelar citas. La agenda es administrada por el rol administrador.
- Si no hay citas, se muestra el texto: “Cuando se programe una cita para tus mascotas, aparecerá aquí”. El calendario vacío sigue permitiendo navegar entre meses.
- Los datos del servidor se insertan mediante `textContent` y creación de nodos; no se utiliza `innerHTML`.

## Endpoints del servidor

### 1. `GET /api/sesion`

- Petición: sin cuerpo; cookie de sesión enviada automáticamente.
- Respuesta esperada: `{ usuario: { id, nombre_completo, rol, ... }, notificaciones_sin_leer? }`.
- Autorización: el servidor valida que exista una sesión válida y que el usuario esté activo.

### 2. `GET /api/mascotas?activa=true`

- Petición: sin cuerpo; query opcional `activa=true`.
- Respuesta esperada: `{ datos: [{ id, nombre, activa, ... }] }`.
- El servidor devuelve únicamente las mascotas que pertenecen al usuario autenticado.

### 3. `GET /api/citas`

- Petición: sin cuerpo. Query opcional `mascota_id={id}`. Se omite `mes` en la vista Lista para solicitar citas pasadas y futuras.
- Respuesta esperada: `{ datos: [{ id, mascota_id, fecha_cita, hora_cita, motivo_id, veterinaria_id, estado, nombre_mascota?, nombre_motivo?, nombre_veterinaria?, foto_mascota? }] }`.
- El servidor debe devolver todas las citas visibles del usuario, no solo las futuras, y filtrar por la mascota cuando se envíe `mascota_id`.
- `nombre_mascota`, `nombre_motivo`, `nombre_veterinaria` y `foto_mascota` son alias derivados de las relaciones `MASCOTAS`, `MOTIVOS_CONSULTA` y `VETERINARIAS`; no son columnas nuevas.

### 4. `GET /api/citas?mes=AAAA-MM&mascota_id={id}`

- Petición: sin cuerpo. `mes` tiene formato `YYYY-MM`; `mascota_id` es opcional.
- Respuesta esperada: `{ datos: [citas del mes] }` con los mismos campos de la vista Lista.
- El servidor filtra por mes y, si se envía, por mascota del usuario autenticado.
- Los resultados pueden venir ordenados por `fecha_cita` y `hora_cita`; el frontend ordena también los elementos para presentarlos consistentemente.

### Errores

El servidor debe responder errores con el formato `{ error, campos }`. El cliente usa cookies de sesión (`credentials: same-origin`) y no almacena tokens.

## Relación con MySQL

La tabla origen es `CITAS`, con sus campos `mascota_id`, `veterinaria_id`, `veterinario_id`, `motivo_id`, `fecha_cita`, `hora_cita`, `notas`, `estado`, `creado_en` y `actualizado_en`. Las mascotas se relacionan con `MASCOTAS`, los motivos con `MOTIVOS_CONSULTA` y las clínicas con `VETERINARIAS`. El frontend no agrega tablas ni columnas.

## Verificación

- JavaScript comprobado sintácticamente.
- HTML verificado para estructura e IDs únicos.
- Referencias CSS/JS locales comprobadas.
- CSS comprobado para llaves balanceadas.
- ZIP comprobado al finalizar el empaquetado.
- No se realizaron pruebas contra FastAPI/MySQL; esos servicios todavía deben conectarse.
