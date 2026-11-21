# PetCare — Módulo 11: Administrador, usuarios y mascotas

## Archivos de esta entrega

### Archivos nuevos

- `admin-usuarios.html`: página de gestión de cuentas.
- `css/admin-usuarios.css`: estilos responsive de resumen, búsqueda, tabla, paginación y diálogos.
- `js/admin-usuarios.js`: protección por rol, consulta paginada, búsqueda, activación/desactivación con confirmación y detalle de mascotas.

### Archivos compartidos actualizados

- `js/api.js`: documenta y consume los endpoints de administración solicitados; conserva los métodos de los módulos 0–10.
- `js/layout.js`: corrige la ruta del enlace «Usuarios» del menú administrador a `/admin-usuarios.html`, para que abra y marque la página construida.

## Instalación

Copia los archivos respetando estas ubicaciones. Reemplaza solamente los dos archivos compartidos indicados:

```text
PetCare/
├── admin-usuarios.html                 (nuevo)
├── css/
│   └── admin-usuarios.css              (nuevo)
└── js/
    ├── admin-usuarios.js               (nuevo)
    ├── api.js                          (actualizado)
    └── layout.js                       (actualizado)
```

Se reutilizan `css/variables.css`, `css/base.css`, `css/componentes.css`, `js/sesion.js` y `js/utils.js` sin modificarlos. Mantén frontend y `/api` bajo el mismo origen para el envío automático de la cookie de sesión.

## Comportamiento implementado

- Antes de mostrar el área administrativa, `protegerPagina` consulta `GET /api/sesion` y permite exclusivamente `rol === "administrador"`. Una cuenta usuario se redirige al inicio; una sesión ausente vuelve al login. FastAPI debe repetir la autorización en cada endpoint, ya que la protección del navegador no es una barrera de seguridad.
- La tabla presenta nombre, correo, teléfono, estado, fecha de registro y cantidad de mascotas.
- La búsqueda envía `q` al servidor; cambiar el término devuelve a la primera página.
- La paginación es controlada por el servidor mediante `pagina`, `total_paginas` y `total_registros`.
- La columna `cantidad_mascotas` es un conteo de presentación calculado con `MASCOTAS.usuario_id`; no es una columna de `USUARIOS`.
- Cada cambio de estado requiere confirmación. La interfaz solo actualiza el listado después de que el `PATCH` responde correctamente. Si falla, mantiene la información previa y muestra el error devuelto.
- «Ver detalle» consulta las mascotas con el endpoint específico; incluye datos disponibles de `MASCOTAS`, `ESPECIES` y `RAZAS`.
- Las acciones «Agendar cita» y «Carnet de vacunas» pasan `usuario_id` en la query string a las futuras pantallas de administración.
- Los datos remotos se insertan con `textContent` y nodos DOM; no se utiliza `innerHTML`.
- Se incluyen estados de carga, vacío, error y reintento, además de controles accesibles y diálogos nativos.

## Endpoints que debe implementar FastAPI

Todos los endpoints siguientes requieren sesión válida y rol `administrador`. El servidor no debe confiar en identificadores, filtros ni roles enviados por el navegador para decidir el acceso.

### 1. Listado y paginación

`GET /api/admin/usuarios?q=&pagina=`

- Petición: sin cuerpo.
- Query `q`: término opcional para buscar por `USUARIOS.nombre_completo` o `USUARIOS.correo`.
- Query `pagina`: número de página, comenzando en 1. El backend define y mantiene el tamaño de página.
- Respuesta: `{ datos, pagina, total_paginas, total_registros }`.
- Cada objeto de `datos` debe incluir `id`, `nombre_completo`, `correo`, `telefono`, `activo`, `creado_en` y `cantidad_mascotas`; `foto_url` es opcional para presentar el avatar.
- `cantidad_mascotas` debe calcularse desde `MASCOTAS.usuario_id` (por ejemplo, con `COUNT` agrupado), no leerse de una columna que no existe.
- Se recomienda listar cuentas cuyo `USUARIOS.rol = 'usuario'`, evitando mezclar administradores con la gestión habitual de dueños de mascotas.
- Nunca devolver `password_hash`, información de `SESIONES`, tokens ni datos privados.

Ejemplo de forma de respuesta (estructura contractual, no datos de prueba):

```json
{
  "datos": [
    {
      "id": "identificador",
      "nombre_completo": "",
      "correo": "",
      "telefono": null,
      "activo": true,
      "creado_en": "fecha-hora del registro",
      "cantidad_mascotas": 0,
      "foto_url": null
    }
  ],
  "pagina": 1,
  "total_paginas": 1,
  "total_registros": 0
}
```

Los valores del ejemplo describen tipos y estructura, no registros que deban insertarse.

### 2. Activar o desactivar una cuenta

`PATCH /api/admin/usuarios/{id}/activo`

- Cuerpo JSON: `{ "activo": true }` o `{ "activo": false }`.
- Respuesta: `{ "usuario": { "id", "nombre_completo", "activo" } }` o una respuesta sin contenido `204`.
- El servidor debe comprobar el rol de la sesión, validar que la cuenta objetivo sea una cuenta de usuario y aplicar el cambio en `USUARIOS.activo`.
- Evitar que un administrador pueda desactivar su propia cuenta mediante esta operación.

### 3. Consultar mascotas de una cuenta

`GET /api/admin/usuarios/{id}/mascotas`

- Petición: sin cuerpo.
- Respuesta: `{ "datos": [...] }`.
- Los objetos deben incluir los campos existentes de `MASCOTAS` necesarios para la vista: `id`, `usuario_id`, `nombre`, `especie_id`, `raza_id`, `sexo`, `color`, `fecha_nacimiento`, `estado_salud`, `foto_url`, `activa`, `creado_en`; se pueden incluir alias derivados `nombre_especie` y `nombre_raza` desde los catálogos.
- El servidor valida que el ID corresponda a una cuenta existente y que el solicitante sea administrador. El resultado debe pertenecer únicamente a ese dueño.

### 4. Validación de sesión

`GET /api/sesion`

- Petición: sin cuerpo; cookie administrada por el servidor.
- Respuesta: `{ "usuario": { "id", "nombre_completo", "correo", "rol", "foto_url", "activo" } }`.
- Solo `rol = "administrador"` continúa dentro de esta página.

## Enlaces a los módulos 12 y 13

El detalle del usuario genera estos destinos conservando la cuenta seleccionada:

- Agendar cita: `/admin/citas.html?usuario_id={id}`.
- Carnet de vacunas: `/admin/vacunas.html?usuario_id={id}`.

Los módulos 12 y 13 deberán leer `usuario_id` al iniciar y usarlo para seleccionar al dueño. Esta entrega no crea ni modifica esas pantallas.

## Relación con el esquema MySQL

Los campos persistidos usados por este módulo están en `USUARIOS` (`nombre_completo`, `correo`, `telefono`, `ciudad`, `pais`, `foto_url`, `rol`, `activo`, `creado_en`) y `MASCOTAS` (`usuario_id`, `nombre`, `especie_id`, `raza_id`, `sexo`, `estado_salud`, `foto_url`, `activa`, entre otros). `cantidad_mascotas`, `nombre_especie` y `nombre_raza` son valores calculados/derivados para la respuesta, no nuevas columnas.

## Formato de errores

Conservar el contrato común de PetCare:

```json
{
  "error": "Mensaje del servidor",
  "campos": {}
}
```

- `401`: sesión ausente o expirada.
- `403`: sesión válida sin rol administrador.
- `404`: cuenta no encontrada.
- `422` u otro 4xx: datos o parámetros inválidos.

## Verificaciones y límites

- Revisada la sintaxis de `admin-usuarios.js`, `api.js` y `layout.js`.
- Revisada la estructura HTML, las rutas de recursos, los selectores CSS y el ZIP.
- La interfaz no inserta registros de ejemplo ni simula respuestas.
- No se ha probado contra una implementación real de FastAPI/MySQL; el backend todavía debe implementar los contratos documentados.
