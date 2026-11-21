# PetCare — Módulo 9: Notificaciones

## Archivos de esta entrega

### Archivos nuevos

- `notificaciones.html`: página protegida de la bandeja de notificaciones.
- `css/notificaciones.css`: estilos responsive de filtros, estados y tarjetas.
- `js/notificaciones.js`: carga, ordenamiento, filtros, lectura individual y lectura masiva.

### Archivos compartidos actualizados

- `js/api.js`: actualiza las rutas y la documentación de `api.notificaciones` al contrato solicitado. Conserva las funciones de módulos anteriores, incluido el asistente y las veterinarias.
- `js/layout.js`: cambia el enlace de la campana por un botón accesible con desplegable, vista previa de cinco notificaciones no leídas y contador sincronizado.
- `css/componentes.css`: estilos compartidos del desplegable de la campana.

## Instalación en el proyecto

Copia los archivos respetando estas rutas, sobrescribiendo únicamente los tres recursos compartidos incluidos en esta entrega:

```text
PetCare/
├── notificaciones.html                 (nuevo)
├── css/
│   ├── notificaciones.css              (nuevo)
│   └── componentes.css                 (actualizado)
└── js/
    ├── notificaciones.js               (nuevo)
    ├── api.js                          (actualizado)
    └── layout.js                       (actualizado)
```

No reemplaces `variables.css`, `base.css`, `sesion.js` ni `utils.js`; el módulo importa los recursos compartidos ya existentes. El servidor debe seguir sirviendo frontend y `/api` desde el mismo origen para que la cookie de sesión se envíe automáticamente.

## Comportamiento implementado

- La página permite el acceso a los roles `usuario` y `administrador` después de validar `GET /api/sesion`.
- La bandeja consulta notificaciones ordenadas por `creado_en` descendente.
- El filtro **Todas** solicita todos los registros. **Sin leer** envía `leidas=false`.
- Las notificaciones no leídas se presentan con fondo rosa y un indicador circular.
- El tiempo se calcula desde `creado_en` con `Intl.RelativeTimeFormat` en español de Colombia. Un `DATETIME` de MySQL se interpreta como hora local para evitar desplazamientos accidentales de zona horaria.
- Al pulsar una notificación no leída, el cliente espera la confirmación de `PATCH /api/notificaciones/{id}/leer`, actualiza el contador y navega si existe un identificador relacionado.
- **Marcar todas como leídas** espera la confirmación de `PATCH /api/notificaciones/leer-todas` antes de actualizar la interfaz.
- La campana consulta `GET /api/notificaciones?leidas=false`, muestra hasta cinco avisos recientes, actualiza el contador, cierra con Escape o clic externo y permite abrir la bandeja completa.
- El contenido recibido del servidor siempre se coloca mediante `textContent` o nodos DOM. No se utiliza `innerHTML`.
- Se incluyen estados de carga, vacío, error y reintento.

## Endpoints que debe implementar FastAPI

### 1. Validación de sesión

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/sesion` | Ninguno; cookie de sesión | `{ usuario: { id, nombre_completo, correo, rol, ... }, notificaciones_sin_leer? }` |

El servidor valida que la sesión exista y que el usuario esté activo. La autorización definitiva de cada endpoint permanece en el backend.

### 2. Listado y filtros

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/notificaciones?leidas=` | Ninguno | `{ datos: [notificaciones...] }` |

Parámetro opcional:

- `leidas=false`: solo no leídas.
- `leidas=true`: solo leídas.
- Sin parámetro: todas.

Cada elemento debe contener los campos de `NOTIFICACIONES` necesarios para la interfaz:

```json
{
  "id": 0,
  "usuario_id": 0,
  "tipo": "recordatorio",
  "titulo": "",
  "mensaje": "",
  "leida": 0,
  "mascota_id": null,
  "vacunacion_id": null,
  "cita_id": null,
  "creado_en": ""
}
```

El objeto anterior describe la forma del contrato, no es un registro de prueba. `creado_en` debe ser un valor de fecha-hora real almacenado por el servidor. Los resultados deben venir ordenados por `creado_en` descendente y limitarse siempre al usuario autenticado (`NOTIFICACIONES.usuario_id`). No se debe aceptar `usuario_id` enviado por el navegador como criterio de autorización.

### 3. Marcar una notificación como leída

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| PATCH | `/api/notificaciones/{id}/leer` | Ninguno | `{ notificacion }` o `204 No Content` |

El backend actualiza `NOTIFICACIONES.leida = 1` únicamente si el registro pertenece al usuario de la sesión. Si el ID no existe o no pertenece al usuario, debe responder con el estado HTTP correspondiente sin revelar información de otra cuenta.

### 4. Marcar todas como leídas

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| PATCH | `/api/notificaciones/leer-todas` | Ninguno | `{ actualizadas: number }` |

Solo actualiza las notificaciones no leídas del usuario autenticado. El contador vuelve a cero cuando la operación responde correctamente.

### Errores

Mantener el formato común de PetCare:

```json
{
  "error": "Mensaje del servidor",
  "campos": {}
}
```

Una sesión ausente o expirada debe responder `401`; un usuario autenticado sin permiso, `403`; validaciones y registros inexistentes deben usar códigos 4xx apropiados.

## Tipos de notificación y esquema MySQL

El esquema original de PetCare contiene esta definición en `NOTIFICACIONES`:

- `tipo ENUM('vacuna','cita','recordatorio','sistema')`
- `titulo`, `mensaje`, `leida`, `mascota_id`, `vacunacion_id`, `cita_id` y `creado_en`.

El diseño solicitado utiliza estos tipos de presentación:

- `cita_confirmada`
- `cita_completada`
- `recordatorio`
- `vacuna_proxima`
- `vacuna_vencida`
- `novedad`

Para no cambiar la base de datos a la fuerza, el contrato de la API puede devolver `tipo` normalizado como alias calculado:

- Para una fila `tipo='cita'` con `cita_id`, consultar `CITAS.estado`: `confirmada` se presenta como `cita_confirmada` y `completada` como `cita_completada`.
- Para una fila `tipo='vacuna'` con `vacunacion_id`, consultar `v_vacunaciones_estado`: `proxima` se presenta como `vacuna_proxima` y `vencida` como `vacuna_vencida`.
- `recordatorio` se conserva.
- `sistema` se presenta como `novedad`.

Si prefieres persistir directamente los seis tipos en `NOTIFICACIONES.tipo`, tendrás que modificar el `ENUM` mediante una migración. El frontend soporta tanto los tipos nuevos como los valores generales existentes, pero solo el servidor puede distinguir de forma fiable las categorías específicas usando las relaciones y el estado de las citas/vacunas.

## Navegación desde una notificación

El módulo usa estas rutas cuando el registro contiene la relación correspondiente:

- `cita_id`: `/citas.html?cita_id={id}`
- `vacunacion_id`: `/vacunas.html?vacunacion_id={id}`
- `mascota_id`: `/mascota.html?id={id}`

Las páginas de destino deberán leer esos parámetros para resaltar el registro concreto; este módulo no modifica los módulos de citas, vacunas ni mascotas.

## Decisiones y límites

- No se crean notificaciones locales ni datos ficticios; todos los registros deben proceder de MySQL a través de la API.
- La campana usa el mismo listado de no leídas para obtener el contador; no requiere un endpoint extra de conteo.
- El orden se vuelve a validar en el navegador por `creado_en`, aunque el servidor debe entregar el orden solicitado.
- El cliente no establece `leida=1` hasta recibir confirmación del servidor.
- La página no modifica títulos, mensajes ni tipos de las notificaciones.
- La entrega no implementa backend ni ejecuta pruebas contra una base de datos real.

## Verificaciones realizadas

- Sintaxis de `js/notificaciones.js`, `js/layout.js` y `js/api.js` comprobada con Node.js.
- Balance de llaves CSS comprobado en `notificaciones.css` y `componentes.css`.
- Revisadas las rutas HTTP del módulo y la presencia de los recursos compartidos requeridos.
- No se ha probado la integración real con FastAPI ni la navegación profunda en los módulos de destino.
