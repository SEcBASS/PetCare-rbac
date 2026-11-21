# PetCare — Módulo 12: Administrador, agendar y gestionar citas

## Archivos de esta entrega

### Páginas y recursos nuevos

- `admin-citas.html`: gestión de citas con filtros, vista de lista y calendario mensual.
- `admin-cita-nueva.html`: formulario de agendamiento en una sola pantalla.
- `admin/citas.html`: ruta de compatibilidad que conserva los parámetros del enlace emitido por el Módulo 11 y redirige al formulario de nueva cita.
- `css/admin-citas.css`: estilos responsive de filtros, tabla, calendario y diálogo de gestión.
- `css/admin-cita-nueva.css`: estilos responsive del formulario y del resumen dinámico.
- `js/admin-citas.js`: consulta de citas, filtros, calendario, confirmación de cambios de estado y reprogramación.
- `js/admin-cita-nueva.js`: búsqueda de usuarios, carga de mascotas, catálogos, disponibilidad y creación de citas.
- `js/admin-citas-redirect.js`: redirección de compatibilidad hacia el formulario canónico, conservando `usuario_id`.

### Archivos compartidos actualizados

- `js/api.js`: incorpora `admin.obtenerUsuario` para abrir el formulario con un usuario preseleccionado, `admin.obtenerDisponibilidad` y documentación completa del contrato de citas administrativas. Conserva las funciones previas.
- `js/layout.js`: dirige los enlaces administrativos «Citas» y «Usuarios» a las páginas raíz utilizadas por los módulos 12 y 11.

No reemplaces `variables.css`, `base.css`, `componentes.css`, `sesion.js` ni `utils.js`.

## Instalación

Copia las páginas HTML a la raíz del frontend y los recursos en sus carpetas correspondientes. Reemplaza los archivos compartidos `js/api.js` y `js/layout.js` por las versiones de este ZIP.

```text
PetCare/
├── admin-citas.html
├── admin-cita-nueva.html
├── admin/
│   └── citas.html              (compatibilidad con el Módulo 11)
├── css/
│   ├── admin-citas.css
│   └── admin-cita-nueva.css
└── js/
    ├── admin-citas.js
    ├── admin-cita-nueva.js
    ├── admin-citas-redirect.js
    ├── api.js                 (actualizado)
    └── layout.js              (actualizado)
```

El frontend y `/api` deben servirse desde el mismo origen para que se envíe la cookie de sesión (`credentials: "same-origin"`). No abras las páginas con `file://`.

## Comportamiento de `admin-cita-nueva.html`

1. Exige sesión con rol `administrador` mediante `GET /api/sesion`.
2. Busca usuarios mediante `GET /api/admin/usuarios?q=&pagina=`. El administrador debe seleccionar una cuenta real; escribir un nombre sin seleccionarlo no asigna una cuenta.
3. Al seleccionar un usuario consulta `GET /api/admin/usuarios/{id}/mascotas` y permite elegir únicamente mascotas activas de esa cuenta.
4. Carga veterinarias y motivos desde los catálogos administrativos `GET /api/admin/veterinarias` y `GET /api/admin/motivos-consulta`.
5. Cuando hay veterinaria y fecha, consulta `GET /api/admin/disponibilidad?veterinaria_id=&fecha=`. El selector de hora contiene solamente franjas devueltas por el servidor; el navegador no genera ni calcula horarios.
6. El panel de resumen se actualiza al cambiar cualquiera de los controles.
7. Envía `POST /api/admin/citas` con `mascota_id`, `veterinaria_id`, `fecha_cita`, `hora_cita`, `motivo_id`, `notas` y `estado: "pendiente"`. No envía `usuario_id` ni `creado_por_id`.
8. Si el servidor devuelve HTTP `409` o un error que indica que la hora se ocupó, informa el conflicto y vuelve a consultar disponibilidad.
9. Si la página recibe `?usuario_id=`, consulta `GET /api/admin/usuarios/{id}` y precarga esa cuenta. Esta ruta de detalle se incorpora como apoyo al enlace directo desde el módulo de usuarios.

## Comportamiento de `admin-citas.html`

- La tabla permite filtrar por estado, veterinaria, fecha y usuario.
- La vista mensual pide al servidor el mes visible y permite abrir cualquier cita.
- El buscador superior del layout filtra los registros ya cargados por mascota, usuario, veterinaria, motivo o estado.
- El diálogo de gestión permite cambiar el estado a `pendiente`, `confirmada`, `completada` o `cancelada`, previa confirmación.
- Permite consultar disponibilidad de otra fecha y guardar fecha/hora con `PATCH /api/admin/citas/{id}`.
- Si se marca una cita como `completada`, ofrece «Registrar vacuna» y pasa `cita_id`, `mascota_id` y `usuario_id` a `/admin-vacunas.html` para que el módulo 13 pueda recuperar el contexto.
- La actualización del estado y la reprogramación se confirman solo después de una respuesta exitosa del servidor.

## Contrato REST que debe implementar FastAPI

Todas las rutas requieren rol `administrador`. El backend vuelve a validar permisos, relaciones, pertenencia de la mascota y disponibilidad. El navegador no es una barrera de autorización.

### 1. Validar sesión

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/sesion` | Ninguno; cookie de sesión | `{ usuario: { id, nombre_completo, rol, activo, ... } }` |

### 2. Buscar usuarios y precargar una cuenta

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/admin/usuarios?q={q}&pagina={pagina}` | Ninguno | `{ datos: [{ id, nombre_completo, correo, telefono, activo, creado_en, cantidad_mascotas }], pagina, total_paginas, total_registros }` |
| GET | `/api/admin/usuarios/{id}` | Ninguno | `{ usuario: { id, nombre_completo, correo, telefono, activo, creado_en } }` |
| GET | `/api/admin/usuarios/{id}/mascotas` | Ninguno | `{ datos: [{ id, usuario_id, nombre, especie_id, nombre_especie?, raza_id?, nombre_raza?, activa, ... }] }` |

El endpoint individual `GET /api/admin/usuarios/{id}` es una adición necesaria para hidratar enlaces directos con `usuario_id`. El servidor solo devuelve cuentas de rol `usuario` y mascotas que pertenecen a la cuenta solicitada.

### 3. Catálogos administrativos

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/admin/veterinarias` | Ninguno | `{ datos: [{ id, nombre, direccion, activa, ... }] }` |
| GET | `/api/admin/motivos-consulta` | Ninguno | `{ datos: [{ id, nombre, activo }] }` |

Los registros desactivados no se presentan como opciones para crear citas. Los catálogos corresponden a `VETERINARIAS` y `MOTIVOS_CONSULTA`.

### 4. Consultar disponibilidad

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/admin/disponibilidad?veterinaria_id={id}&fecha={AAAA-MM-DD}` | Ninguno | `{ datos: [{ hora_cita }] }` |

Para reprogramar, el cliente puede enviar el parámetro opcional `excluir_cita_id={id}` para que el servidor no considere la cita actual como una ocupación de sí misma.

El servidor calcula las horas desde `HORARIOS_VETERINARIA` (campos `dia_semana`, `hora_apertura`, `hora_cierre`, `duracion_cita_min`) y las citas ocupadas en `CITAS`. Debe devolver únicamente horas realmente disponibles. La respuesta también puede exponer `horas_disponibles` como arreglo de strings; el cliente acepta ambas formas.

### 5. Listar y filtrar citas

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/admin/citas?estado=&veterinaria_id=&fecha=&usuario_id=&mes=` | Ninguno | `{ datos: [{ id, mascota_id, usuario_id, nombre_usuario, nombre_mascota, veterinaria_id, nombre_veterinaria, veterinario_id?, nombre_veterinario?, motivo_id, nombre_motivo, fecha_cita, hora_cita, notas, estado, creado_en, actualizado_en }] }` |

Todos los filtros son opcionales. `fecha` usa `AAAA-MM-DD`; `mes` usa `AAAA-MM`. Los campos `usuario_id`, `nombre_usuario`, `nombre_mascota`, `nombre_veterinaria`, `nombre_veterinario` y `nombre_motivo` son alias derivados de las relaciones; no deben agregarse como columnas redundantes a `CITAS`. El servidor debe devolver las citas ordenadas por fecha y hora para la vista activa.

La relación de propietario se obtiene mediante `CITAS.mascota_id → MASCOTAS.id → MASCOTAS.usuario_id`, porque `CITAS` no tiene `usuario_id`.

### 6. Crear cita

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| POST | `/api/admin/citas` | `{ mascota_id, veterinaria_id, fecha_cita, hora_cita, motivo_id, notas?, estado? }` | `{ cita }` |

El backend asigna el estado inicial `pendiente` cuando no se proporciona. Debe comprobar que la mascota siga activa y pertenezca al usuario seleccionado indirectamente, que la veterinaria y el motivo estén activos y que la hora no esté ocupada. Una colisión de horario debe responder `409 Conflict` con el formato de error común.

**No se envía `creado_por_id` desde el navegador.** El backend identifica al administrador mediante la cookie de sesión. Si se desea guardar ese dato en la fila, se requiere primero agregar la columna `creado_por_id` a `CITAS` mediante una migración; la definición original de la tabla no contiene esa columna.

### 7. Cambiar estado y reprogramar

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| PATCH | `/api/admin/citas/{id}` | `{ estado }` o `{ fecha_cita, hora_cita }`; también admite otros campos editables de `CITAS` si la política lo permite | `{ cita }` |

`estado` admite `pendiente`, `confirmada`, `completada` y `cancelada`. El backend debe validar la transición permitida y, cuando se cambien fecha/hora, ejecutar otra vez la comprobación de disponibilidad. Una colisión responde `409 Conflict`.

### Errores

Mantener el formato común:

```json
{
  "error": "Mensaje del servidor",
  "campos": {}
}
```

Una sesión ausente o expirada responde `401`; un usuario sin rol administrador responde `403`; relaciones inválidas, datos incorrectos o registros inexistentes responden con el código 4xx apropiado. El cliente muestra `error` y los mensajes de `campos` disponibles.

## Correspondencia con el esquema MySQL existente

- `CITAS` contiene `id`, `mascota_id`, `veterinaria_id`, `veterinario_id`, `motivo_id`, `fecha_cita`, `hora_cita`, `notas`, `estado`, `creado_en` y `actualizado_en`.
- `MOTIVOS_CONSULTA` es la tabla exacta del esquema.
- `HORARIOS_VETERINARIA` es la tabla exacta del esquema; el nombre `veterinaria_horarios` mencionado en el requerimiento debe mapearse a esta tabla, no a una tabla nueva.
- `CITAS` no almacena directamente `usuario_id`; el dueño se resuelve a través de `MASCOTAS.usuario_id`.
- `CITAS` tampoco contiene `creado_por_id`. Para persistir el administrador creador, hay que agregar la columna con una migración o registrar la autoría en otro mecanismo del backend.

## Integración con el Módulo 11

El módulo 11 previamente entregado utiliza el destino `/admin/citas.html?usuario_id=...` en su acceso directo de «Agendar cita». Esta entrega incluye `admin/citas.html` como ruta de compatibilidad: redirige a `/admin-cita-nueva.html` y conserva todos los parámetros de consulta, incluido `usuario_id`. La página canónica de agendamiento es `/admin-cita-nueva.html`; no fue necesario modificar los archivos del módulo 11.

## Verificaciones realizadas

- Sintaxis de los cuatro archivos JavaScript comprobada con Node.js.
- Estructura de ambos HTML revisada y llaves de CSS balanceadas.
- Los scripts construyen el contenido recibido mediante nodos DOM y `textContent`; no usan `innerHTML` ni `console.log`.
- No se incluyen citas, usuarios, mascotas, horarios ni veterinarias de demostración.
- No se probó la conexión real con FastAPI ni con MySQL; las verificaciones son estáticas.
