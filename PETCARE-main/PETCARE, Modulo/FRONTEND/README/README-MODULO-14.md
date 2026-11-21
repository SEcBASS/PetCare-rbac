# PetCare — Módulo 14: Administrador de catálogos

## Archivos

- `admin-catalogos.html`: página administrativa solicitada.
- `css/admin-catalogos.css`: estilos del módulo.
- `js/admin-catalogos.js`: pestañas, formularios, consultas y operaciones de catálogo.
- `js/api.js`: versión compartida actualizada; `actualizarCatalogo` utiliza `PUT`.
- `js/layout.js`: el enlace «Catálogos» del menú administrador apunta a `/admin-catalogos.html`.

Los archivos `api.js` y `layout.js` incluidos son versiones completas y deben reemplazar los archivos compartidos en `js/`. No reemplaces los demás módulos.

## Funcionalidad

### Veterinarias

Permite crear y editar los campos de `VETERINARIAS`: `nombre`, `direccion`, `ciudad`, `pais`, `telefono`, `correo`, `latitud`, `longitud` y `activa`. `id` y `creado_en` se muestran como metadatos de solo lectura porque los genera la base de datos. Las etiquetas se introducen separadas por comas y se envían como un arreglo JSON.

Los horarios se gestionan por día de la semana, con tantos tramos como necesite cada día. Cada tramo contiene `dia_semana`, `hora_apertura`, `hora_cierre` y `duracion_cita_min`. La numeración utilizada es 1 = lunes, 2 = martes, …, 7 = domingo. El formulario comprueba que la hora de cierre sea posterior a la apertura y que los tramos del mismo día no se superpongan.

### Vacunas

Permite crear y editar `nombre`, `especie_id`, `descripcion`, `intervalo_refuerzo_dias` y `activa`. La lista de especies se consulta a `GET /api/admin/especies`; no se inventan identificadores. `especie_id = null` significa que la vacuna aplica a ambas especies (perro y gato). El intervalo de refuerzo es opcional y se conserva porque ya existe en `VACUNAS`.

### Motivos de consulta

Permite crear y editar `nombre` y `activo`.

### Desactivación

La interfaz no expone borrado físico. La acción «Desactivar» envía `activa: false` para veterinarias y vacunas, o `activo: false` para motivos; «Activar» restaura el valor. Así se conserva el historial y las relaciones de citas o vacunaciones. El backend debe aplicar la autorización de administrador y nunca confiar en el rol enviado por el navegador.

## Contrato de API

Todas las peticiones utilizan la cookie de sesión del servidor y JSON. Todas las rutas están bajo `/api`.

| Método | Ruta | Cuerpo | Respuesta esperada |
|---|---|---|---|
| GET | `/api/admin/veterinarias` | Ninguno | `{ datos: [veterinaria] }` |
| POST | `/api/admin/veterinarias` | Campos editables de veterinaria y `horarios: [...]` | `{ registro }` |
| PUT | `/api/admin/veterinarias/{id}` | Representación completa editable, incluida `activa` | `{ registro }` |
| GET | `/api/admin/vacunas` | Ninguno | `{ datos: [vacuna] }` |
| POST | `/api/admin/vacunas` | `{ nombre, especie_id, descripcion?, intervalo_refuerzo_dias?, activa }` | `{ registro }` |
| PUT | `/api/admin/vacunas/{id}` | Representación completa editable, incluida `activa` | `{ registro }` |
| GET | `/api/admin/motivos-consulta` | Ninguno | `{ datos: [motivo] }` |
| POST | `/api/admin/motivos-consulta` | `{ nombre, activo }` | `{ registro }` |
| PUT | `/api/admin/motivos-consulta/{id}` | Representación completa editable, incluido `activo` | `{ registro }` |
| GET | `/api/admin/especies` | Ninguno | `{ datos: [{ id, nombre }] }` |

### Forma de veterinaria y horarios

`GET /api/admin/veterinarias` debe devolver cada veterinaria con un arreglo `horarios`, incluso si está vacío:

```json
{
  "datos": [
    {
      "id": 1,
      "nombre": "Centro veterinario",
      "direccion": "Dirección",
      "ciudad": "Barranquilla",
      "pais": "CO",
      "telefono": null,
      "correo": null,
      "latitud": null,
      "longitud": null,
      "etiquetas": ["urgencias", "24 horas"],
      "activa": true,
      "creado_en": "2026-11-04 10:00:00",
      "horarios": [
        { "dia_semana": 1, "hora_apertura": "08:00:00", "hora_cierre": "12:00:00", "duracion_cita_min": 30 },
        { "dia_semana": 1, "hora_apertura": "14:00:00", "hora_cierre": "18:00:00", "duracion_cita_min": 30 }
      ]
    }
  ]
}
```

El ejemplo anterior describe el formato, no son registros que deban insertarse como datos de demostración. Para `POST` y `PUT`, `horarios` lleva el arreglo de tramos. Si se envía el arreglo en un `PUT`, el backend reemplaza los horarios de esa veterinaria en la misma transacción que actualiza los demás campos. Si se envía `horarios: []`, se dejan todos los días sin tramos.

El backend debe verificar que cada tramo corresponda a un día entre 1 y 7, que `hora_cierre > hora_apertura`, que la duración sea válida y que no haya tramos superpuestos para el mismo día. También debe verificar latitud (-90 a 90), longitud (-180 a 180), correo, longitudes y duplicados de nombre según las restricciones vigentes.

### Errores y permisos

Mantén el formato común `{ "error": "Mensaje", "campos": {} }`. Responde `401` para sesión ausente/expirada y `403` para una sesión que no tenga rol administrador. Usa `404` para IDs inexistentes, `409` para conflictos de unicidad y `422` para datos inválidos. El navegador presenta esos errores sin insertar HTML recibido del servidor.

## Ajustes necesarios en MySQL 8

El esquema inicial compartido no contiene `VETERINARIAS.etiquetas` ni `VACUNAS.descripcion`. Además, `HORARIOS_VETERINARIA` tiene una restricción `UNIQUE (veterinaria_id, dia_semana)` que impide guardar varios tramos el mismo día. Estas modificaciones son necesarias para cumplir el formulario:

```sql
ALTER TABLE VETERINARIAS
  ADD COLUMN etiquetas JSON NULL AFTER longitud;

ALTER TABLE VACUNAS
  ADD COLUMN descripcion VARCHAR(255) NULL AFTER especie_id;
```

Para permitir varios tramos por día, primero identifica el nombre real del índice único actual:

```sql
SHOW INDEX FROM HORARIOS_VETERINARIA;
```

En el resultado, localiza el índice `UNIQUE` compuesto únicamente por `veterinaria_id` y `dia_semana`. Elimínalo usando el nombre exacto que tenga en tu base:

```sql
ALTER TABLE HORARIOS_VETERINARIA
  DROP INDEX nombre_real_del_indice_unico;
```

Después crea una unicidad por veterinaria, día y hora de inicio, de modo que se puedan registrar dos o más tramos distintos en un mismo día, pero no duplicar una misma hora de apertura:

```sql
ALTER TABLE HORARIOS_VETERINARIA
  ADD UNIQUE KEY uq_horario_veterinaria_dia_inicio
  (veterinaria_id, dia_semana, hora_apertura);
```

Haz una copia de seguridad antes de ejecutar cambios y verifica que no haya horarios duplicados que entren en conflicto con el nuevo índice. No ejecutes literalmente `nombre_real_del_indice_unico`: sustitúyelo por el nombre devuelto por `SHOW INDEX`.

## Correspondencia con otros módulos

- El módulo 12 de citas utiliza `GET /api/admin/veterinarias` y `GET /api/admin/motivos-consulta`; el catálogo debe devolver solo los campos que esos formularios necesitan además de los nuevos datos.
- El módulo 13 de carnet utiliza `GET /api/admin/vacunas?especie_id=`, por lo que el endpoint de vacunas debe mantener el filtro opcional `especie_id` y devolver `id`, `nombre`, `especie_id` y `activa` además de `descripcion` e `intervalo_refuerzo_dias`.
- La disponibilidad de citas debe calcularse desde todos los tramos de `HORARIOS_VETERINARIA`, no solo desde el primero de cada día.

## Verificaciones

Se realizan verificaciones estáticas de sintaxis, referencias de archivos, HTML y CSS. No se afirma una conexión real con FastAPI ni con MySQL; el servidor debe implementar los contratos anteriores y aplicar las migraciones antes de usar las funciones nuevas.
