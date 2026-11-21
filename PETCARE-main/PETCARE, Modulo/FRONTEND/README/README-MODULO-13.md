# PetCare — Módulo 13: Administrador, carnet de vacunas

## Archivos de esta entrega

### Nuevos
- `admin-vacunas.html`: página administrativa del carnet de vacunación.
- `css/admin-vacunas.css`: estilos responsive de filtros, contadores, tabla y formulario modal.
- `js/admin-vacunas.js`: protección por rol, búsqueda de usuarios, selección de mascotas, consulta del carnet, filtros de catálogo por especie y operaciones CRUD.

### Compartidos actualizados
- `js/api.js`: añade los métodos del carnet administrativo y conserva los endpoints anteriores.
- `js/layout.js`: incorpora el acceso «Carnet de vacunas» al menú lateral del administrador.

## Instalación

Copia los archivos manteniendo esta estructura. Reemplaza `js/api.js` y `js/layout.js` por las versiones incluidas para conservar todos los módulos y activar el acceso directo desde la navegación administrativa.

```text
PetCare/
├── admin-vacunas.html
├── README-MODULO-13.md
├── css/
│   └── admin-vacunas.css
└── js/
    ├── admin-vacunas.js
    ├── api.js                 (actualizado)
    └── layout.js              (actualizado)
```

Se reutilizan `variables.css`, `base.css`, `componentes.css`, `sesion.js` y `utils.js` existentes. La página requiere que frontend y API compartan origen para enviar la cookie de sesión.

## Comportamiento

- Solo permite el acceso al rol `administrador` mediante `protegerPagina` y `GET /api/sesion`. FastAPI debe validar el rol en todos los endpoints; la protección visual no reemplaza la autorización del servidor.
- El buscador consulta `GET /api/admin/usuarios?q=&pagina=1`. Al seleccionar una cuenta consulta `GET /api/admin/usuarios/{id}/mascotas` y muestra sus mascotas.
- La URL puede precargar `usuario_id`, `mascota_id` y `cita_id`, compatible con el enlace «Registrar vacuna» que se genera desde el Módulo 12.
- El carnet se consulta desde `GET /api/admin/mascotas/{id}/vacunas`. La respuesta debe incluir los registros de `VACUNACIONES`, el nombre de `VACUNAS` y los alias de presentación; el estado procede de `v_vacunaciones_estado` (`al_dia`, `proxima`, `vencida`).
- Los contadores se recalculan con la respuesta del carnet tras registrar, editar o eliminar, sin recargar la página.
- El selector de vacunas consulta `/api/admin/vacunas?especie_id={id}`. El backend debe devolver las vacunas activas de esa especie y las vacunas globales con `especie_id IS NULL`. Si la mascota no tiene `especie_id`, el cliente solicita el catálogo completo.
- Veterinarias y veterinarios se consultan desde los catálogos administrativos existentes. Los veterinarios sugeridos se limitan a la veterinaria seleccionada. El campo acepta texto; el backend debe resolver `nombre_veterinario` a `VETERINARIOS.id` o responder un error de validación claro. Cuando coincide con un registro existente, el cliente también envía `veterinario_id`.
- La cita asociada es opcional. Se solicita con `GET /api/admin/citas?mascota_id={id}` y se filtra en el navegador por la mascota seleccionada. El servidor debe volver a comprobar la relación al guardar.
- `fecha_aplicacion` no puede ser posterior al día actual. `proxima_dosis`, cuando se indica, debe ser posterior a `fecha_aplicacion`. Son validaciones de ayuda y el servidor debe repetirlas.
- El cliente nunca envía `registrado_por_id`; el backend debe obtener el identificador del administrador autenticado desde la sesión.
- El contenido remoto se representa con `textContent` y nodos DOM. No se utiliza `innerHTML`.
- Se incluyen estados de carga, error, vacío y reintento. Se impide el doble envío mientras se guarda.

## Endpoints que debe implementar FastAPI

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/sesion` | Cookie de sesión | `{ usuario: { id, rol, ... } }` |
| GET | `/api/admin/usuarios?q=&pagina=` | Ninguno | `{ datos: [{ id, nombre_completo, correo, ... }], pagina, total_paginas, total_registros }` |
| GET | `/api/admin/usuarios/{id}/mascotas` | Ninguno | `{ datos: [{ id, usuario_id, nombre, especie_id, nombre_especie, activa, ... }] }` |
| GET | `/api/admin/mascotas/{id}/vacunas` | Ninguno | `{ datos: [{ id, mascota_id, vacuna_id, nombre_vacuna, fecha_aplicacion, proxima_dosis, veterinaria_id, nombre_veterinaria, veterinario_id, nombre_veterinario?, lote, notas, cita_id?, estado }] }` |
| GET | `/api/admin/vacunas?especie_id=` | Ninguno | `{ datos: [{ id, nombre, especie_id, activa }] }` |
| GET | `/api/admin/veterinarias` | Ninguno | `{ datos: [{ id, nombre, activa }] }` |
| GET | `/api/admin/veterinarios?veterinaria_id=` | Ninguno | `{ datos: [{ id, veterinaria_id, nombre, especialidad, activo }] }` |
| GET | `/api/admin/citas?mascota_id=` | Ninguno | `{ datos: [{ id, mascota_id, fecha_cita, hora_cita, estado, nombre_motivo? }] }` |
| POST | `/api/admin/vacunas-aplicadas` | `{ mascota_id, vacuna_id, fecha_aplicacion, proxima_dosis?, veterinaria_id?, veterinario_id?, nombre_veterinario?, lote?, notas?, cita_id? }` | `{ vacunacion }` |
| PUT | `/api/admin/vacunas-aplicadas/{id}` | Los campos editables anteriores | `{ vacunacion }` |
| DELETE | `/api/admin/vacunas-aplicadas/{id}` | Ninguno | `204` o `{ mensaje }` |

Los errores deben mantener el contrato común `{ error, campos }`. El servidor valida rol, relaciones entre usuario/mascota/vacuna/veterinaria/veterinario/cita, fechas, propiedad y existencia de cada registro. No debe aceptar `registrado_por_id` del cliente.

## Observaciones importantes del esquema MySQL actual

El esquema de PetCare define `VACUNACIONES` con estos campos: `mascota_id`, `vacuna_id`, `fecha_aplicacion`, `proxima_dosis`, `veterinaria_id`, `veterinario_id`, `lote`, `notas` y `creado_en`. No define `registrado_por_id` ni `cita_id` en esa tabla. Por tanto:

1. Para auditar quién registró una aplicación, se necesita una migración que agregue `registrado_por_id` como FK a `USUARIOS.id` (si se desea persistir la auditoría).
2. Para almacenar la cita asociada, se necesita una migración que agregue `cita_id` como FK a `CITAS.id` (nullable, con la política referencial que se defina).
3. `VACUNACIONES` es la tabla de persistencia; no se debe crear una tabla paralela para este módulo. `nombre_veterinario` es un alias de entrada/salida y se debe resolver contra `VETERINARIOS`, que es la tabla relacionada mediante `veterinario_id`. Si se necesita guardar nombres que no tengan un registro de catálogo, habrá que registrar primero ese veterinario o definir una migración de modelo.

Una migración orientativa para poder persistir auditoría y cita asociada (ajústala a la política referencial que adoptes y respalda la base antes de ejecutarla) sería:

```sql
ALTER TABLE VACUNACIONES
  ADD COLUMN registrado_por_id INT UNSIGNED NULL,
  ADD COLUMN cita_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_vacunaciones_registrado_por
    FOREIGN KEY (registrado_por_id) REFERENCES USUARIOS(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_vacunaciones_cita
    FOREIGN KEY (cita_id) REFERENCES CITAS(id) ON DELETE SET NULL;
```

Las columnas se proponen inicialmente nullable para no bloquear registros históricos. El backend deberá asignar `registrado_por_id` a partir de la sesión autenticada; nunca lo debe aceptar como valor confiable del cuerpo de la petición.

Estas diferencias se documentan para no fingir que los campos ya existen ni enviar `registrado_por_id` desde el navegador.

## Verificaciones

Se comprueba sintaxis de los módulos JavaScript, estructura HTML, balance de llaves CSS, rutas de endpoints y ausencia de `innerHTML`, `console.log` y `TODO` en los archivos nuevos. No se ejecutan peticiones contra FastAPI ni consultas contra MySQL reales en esta entrega.
