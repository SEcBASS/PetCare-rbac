# PetCare — Módulo 4: Mis mascotas y perfil

Este módulo incorpora `mascotas.html` y `mascota.html`. Está construido en HTML, CSS y JavaScript puro, reutiliza el layout y la protección de sesión existentes y no incluye registros de demostración.

## Archivos incorporados o actualizados

```text
petcare/
├── mascotas.html
├── mascota.html
├── css/
│   └── mascotas.css
├── js/
│   ├── mascotas.js
│   ├── mascota.js
│   └── api.js              (amplía los recursos mascotas, pesos y recordatorios)
└── README-MODULO-4.md
```

## Funcionalidad

### Listado (`mascotas.html`)

- Protege la página para el rol `usuario` usando `GET /api/sesion` a través de `protegerPagina`.
- Presenta mascotas activas, búsqueda por nombre y filtros Todas, Perro y Gato.
- Cada tarjeta muestra foto, estado de salud, nombre, especie, raza, edad y peso; las ausencias se muestran como "No registrado".
- Permite abrir el perfil, editar y desactivar con confirmación.
- El formulario modal crea y edita el registro. La raza se consulta según la especie seleccionada.
- La previsualización de foto valida JPG, PNG y WebP con un máximo local de 4 MB.

### Perfil (`mascota.html?id={id}`)

- Encabezado con foto, nombre, estado de salud, especie, raza, edad y peso.
- Información general: especie, raza, edad, peso, sexo y color.
- Gráfica SVG de evolución del peso; solo dibuja puntos que recibe de `HISTORIAL_PESO` a través de la API.
- Próximas citas en modo de solo lectura.
- Recordatorios: listar, crear y marcar como completados.
- Historial de vacunaciones en modo de solo lectura, incluyendo el estado calculado por el servidor.
- La acción "Editar perfil" regresa a `mascotas.html?editar={id}` y abre el modal de edición del listado.

## Endpoints para FastAPI

Todas las peticiones pasan por `js/api.js`, usan JSON y cookie de sesión. La autorización y la comprobación del propietario son responsabilidad del servidor.

### Catálogos que necesita el formulario

**1. `GET /api/especies`**

- Petición: sin cuerpo.
- Respuesta: `{ datos: [{ id, nombre }] }` con los registros de `ESPECIES`. La interfaz solo ofrece las especies cuyo nombre corresponde a perro o gato.

**2. `GET /api/razas?especie_id={id}`**

- Petición: parámetro `especie_id`; sin cuerpo.
- Respuesta: `{ datos: [{ id, especie_id, nombre }] }` con las filas de `RAZAS` de esa especie.

### Mascotas

**3. `GET /api/mascotas`**

- Petición: sin cuerpo. La pantalla envía `?activa=true` para consultar registros activos.
- Respuesta: `{ datos: [...] }` con los campos de `MASCOTAS` necesarios para la tarjeta, más los alias de JOIN/vista `nombre_especie`, `nombre_raza`, `edad_anios` y `peso_actual_kg` cuando estén disponibles.
- El servidor filtra por el usuario autenticado; no confía en un `usuario_id` enviado por el navegador.

**4. `POST /api/mascotas`**

- Petición JSON:

```json
{
  "nombre": "valor del formulario",
  "especie_id": "id de ESPECIES",
  "raza_id": "id de RAZAS o null",
  "sexo": "macho o hembra",
  "color": "texto o null",
  "fecha_nacimiento": "DATE o null",
  "fecha_ingreso": "DATE o null",
  "estado_salud": "excelente, bueno o requiere_atencion",
  "foto": {
    "nombre": "nombre original",
    "tipo": "image/jpeg, image/png o image/webp",
    "contenido_base64": "contenido base64 sin prefijo data URL"
  }
}
```

- `foto` es opcional. La respuesta es `{ mascota }`, incluyendo `foto_url` cuando el archivo se haya almacenado.
- El servidor asigna `usuario_id` desde la sesión y `activa = 1` conforme al esquema; no recibe el dueño del cliente.

**5. `GET /api/mascotas/{id}`**

- Petición: sin cuerpo.
- Respuesta: `{ mascota }` con campos de `MASCOTAS` y alias de consulta `nombre_especie`, `nombre_raza`, `edad_anios` y `peso_actual_kg` cuando sea posible.
- El servidor debe rechazar o no revelar registros que no pertenezcan al usuario autenticado o que estén inactivos.

**6. `PUT /api/mascotas/{id}`**

- Petición JSON: los campos editables de `MASCOTAS` indicados en el POST. Incluye `foto` solo cuando se selecciona un archivo nuevo. Envía `foto_url: null` cuando el usuario quita la foto actual; si no cambia la foto, omite ambos campos para conservarla.
- Respuesta: `{ mascota }` actualizada.
- El servidor comprueba que la mascota pertenece al usuario autenticado.

**7. `DELETE /api/mascotas/{id}`**

- Petición: sin cuerpo.
- Respuesta: `204 No Content` o `{ mascota }` con `activa = 0`.
- Importante: este endpoint implementa desactivación lógica. El servidor debe actualizar `MASCOTAS.activa = 0`; no debe borrar físicamente la fila ni aceptar el ID de dueño del cliente.

### Historial de peso

**8. `GET /api/mascotas/{id}/pesos`**

- Petición: sin cuerpo.
- Respuesta: `{ datos: [{ id, mascota_id, peso_kg, medido_en, creado_en }] }`, consultados desde `HISTORIAL_PESO`, ordenables por `medido_en`.

**9. `POST /api/mascotas/{id}/pesos`**

- Petición JSON: `{ peso_kg, medido_en }`.
- Respuesta: `{ peso }`.
- El servidor valida `peso_kg > 0` y la restricción única `(mascota_id, medido_en)` del esquema.

### Recordatorios

**10. `GET /api/mascotas/{id}/recordatorios`**

- Petición: sin cuerpo.
- Respuesta: `{ datos: [...] }` con campos de `RECORDATORIOS` (`id`, `tipo`, `titulo`, `descripcion`, `fecha_hora`, `completado`, entre otros).
- La consulta se limita a la mascota y al dueño autenticado.

**11. `POST /api/mascotas/{id}/recordatorios`**

- Petición JSON: `{ tipo, titulo, descripcion, fecha_hora }`.
- `tipo` debe pertenecer al ENUM de `RECORDATORIOS`: `vacuna`, `desparasitacion`, `cita`, `control_peso` u `otro`.
- Respuesta: `{ recordatorio }`. El servidor asigna `usuario_id` y `mascota_id` tras verificar la propiedad.

**12. `PATCH /api/recordatorios/{id}/completar`**

- Petición: sin cuerpo.
- Respuesta: `{ recordatorio }` actualizado con `completado = 1`.
- El servidor verifica que el recordatorio pertenece al usuario autenticado.

### Consultas de solo lectura que usa el perfil

**13. `GET /api/citas?mascota_id={id}`**

- Petición: query string, sin cuerpo.
- Respuesta: `{ datos: [...] }` con campos de `CITAS` y alias de JOIN como `motivo_nombre` y `veterinaria_nombre` para la presentación.
- El servidor limita las filas al dueño y mascota autorizados. El frontend filtra futuras y omite canceladas/completadas.

**14. `GET /api/vacunaciones?mascota_id={id}`**

- Petición: query string, sin cuerpo.
- Respuesta: `{ datos: [...] }` con campos de `VACUNACIONES`, alias `vacuna_nombre`, y `estado` calculado (`al_dia`, `proxima` o `vencida`) a partir de `v_vacunaciones_estado`.
- El historial es de solo lectura para el usuario. Las aplicaciones de vacunas las registra el administrador.

## Decisiones de esquema e integración

- Se usan exactamente los nombres de columnas de `MASCOTAS`: `especie_id`, `raza_id`, `fecha_nacimiento`, `fecha_ingreso`, `estado_salud`, `foto_url` y `activa`.
- La etiqueta "Fecha de adopción" se guarda en `MASCOTAS.fecha_ingreso`, porque ese es el campo presente en el esquema MySQL compartido; no se crea una columna `fecha_adopcion`.
- El selector de especie lee `ESPECIES`; la interfaz muestra únicamente Perro y Gato. Las razas proceden de `RAZAS` y se filtran por `especie_id`.
- El gráfico de peso lee el recurso REST `/pesos`, respaldado por `HISTORIAL_PESO` del esquema. No se agrega una tabla `mascota_pesos` al modelo.
- Como el esquema solo contiene `MASCOTAS.foto_url` y no una columna binaria, la interfaz manda la foto opcional como un objeto Base64 dentro del JSON del mismo POST/PUT. El backend debe validar de nuevo tipo/tamaño, almacenar el archivo en el almacenamiento configurado y persistir solo la URL resultante en `foto_url`. No se agrega una ruta de carga ni una columna nueva. Este es el contrato de transferencia elegido para que la UI use los endpoints indicados; debe implementarse igual en FastAPI.
- El peso y los recordatorios se pueden gestionar desde el perfil del usuario. Citas y vacunas no tienen controles de escritura en este módulo.
- Las respuestas ausentes se convierten en estados vacíos; no se generan nombres, fotos, fechas, pesos ni citas de ejemplo.
- Los datos remotos se insertan usando `textContent` y nodos DOM. No se usa `innerHTML`.
- La confirmación del navegador no sustituye la autorización del backend.
- Los errores `{ error, campos }` se muestran en el formulario correspondiente. Las validaciones del navegador son únicamente una ayuda.

## Verificaciones

- JavaScript de los módulos revisado con el parser de Node en modo ES module.
- HTML revisado para IDs duplicados y rutas locales de CSS/JS.
- CSS revisado para llaves balanceadas.
- No se ejecutan pruebas de integración contra FastAPI porque el backend real todavía debe conectarse.
