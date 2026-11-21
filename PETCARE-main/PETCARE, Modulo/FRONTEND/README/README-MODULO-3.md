# PetCare — Módulo 3: Inicio (usuario)

Este módulo implementa `inicio.html` con la navegación reutilizable de `js/layout.js`. Solo pueden acceder las sesiones con `USUARIOS.rol = 'usuario'`; una sesión ausente vuelve a `/login.html` y un administrador se redirige a `/admin-usuarios.html`. La autorización definitiva siempre corresponde al servidor.

## Archivos incorporados o actualizados

```text
petcare/
├── inicio.html
├── css/
│   └── inicio.css
└── js/
    ├── inicio.js
    └── api.js  (se amplía con el recurso inicio)
```

`api.js` se actualiza porque es la única capa autorizada para las solicitudes REST. Las llamadas de la pantalla no usan `fetch` directamente.

## Endpoints que debe implementar el servidor

### 1. Resumen

- **Método y ruta:** `GET /api/inicio/resumen`
- **Petición:** sin cuerpo ni parámetros.
- **Autenticación:** cookie de sesión del servidor. Solo rol `usuario`.
- **Respuesta esperada:**

```ts
{
  resumen: {
    mascotas_registradas: number;
    vacunas_proximas: number;
    proximas_citas: number;
    recordatorios_pendientes: number;
  };
}
```

Los valores anteriores describen exclusivamente la estructura del contrato, no datos para insertar ni resultados de demostración. En producción el servidor debe devolver los contadores reales del usuario autenticado. El esquema guardado previamente nombra la vista `v_resumen_inicio`; la solicitud del módulo la llamó `vista_resumen_inicio`. Se recomienda que el backend consulte la vista real `v_resumen_inicio` o ajuste el nombre de la vista en MySQL de forma coordinada, sin cambiar el endpoint público.

### 2. Próximos eventos

- **Método y ruta:** `GET /api/inicio/eventos`
- **Petición:** sin cuerpo ni parámetros.
- **Autenticación:** cookie de sesión del servidor. Solo eventos pertenecientes a mascotas del usuario autenticado.
- **Respuesta esperada:**

```ts
{
  datos: Array<{
    tipo_evento: "cita" | "vacuna";
    id: number;
    mascota_id: number;
    fecha_evento: string;
    hora_evento: string | null;
    nombre_mascota: string;
    nombre_evento: string;
    estado?: "pendiente" | "confirmada" | "completada" | "cancelada";
  }>;
}
```

Este bloque es el contrato de tipos, no contenido de prueba. El servidor debe sustituirlo por los registros reales. `fecha_evento`, `hora_evento`, `nombre_mascota` y `nombre_evento` son alias de presentación derivados de `CITAS.fecha_cita`, `CITAS.hora_cita`, `VACUNACIONES.proxima_dosis`, `MASCOTAS.nombre`, `MOTIVOS_CONSULTA.nombre` y `VACUNAS.nombre`; no son columnas nuevas en MySQL. En los eventos de tipo `vacuna`, `fecha_evento` corresponde a `VACUNACIONES.proxima_dosis`. Se excluyen dosis sin próxima fecha y se devuelven solo eventos futuros, ordenados cronológicamente. `estado` se usa para los estados de `CITAS` y es opcional en los elementos de tipo vacuna.

### 3. Mis mascotas

Se reutiliza el endpoint existente:

- **Método y ruta:** `GET /api/mascotas?limite=3&activa=true`
- **Petición:** sin cuerpo; filtros `limite` y `activa` en query string.
- **Autenticación:** cookie de sesión; el backend debe filtrar por el usuario propietario sin confiar en IDs enviados por el cliente.
- **Respuesta esperada:** `{ "datos": [ ... ] }`, hasta tres registros activos.
- **Campos utilizados:** `id`, `nombre`, `especie_id`, `raza_id`, `fecha_nacimiento`, `foto_url`, `activa`, más `nombre_especie`, `nombre_raza`, `edad_anios` y `peso_actual_kg` obtenidos mediante JOIN o `v_mascotas_resumen`.

Los alias de presentación `nombre_especie`, `nombre_raza`, `edad_anios` y `peso_actual_kg` deben proceder de los catálogos y de la vista; no se agregan como columnas a `MASCOTAS`. Cuando no exista foto, fecha de nacimiento, raza o peso, la interfaz muestra una indicación de dato no registrado y no inventa un valor.

### 4. Contador de notificaciones de la barra superior

El layout existente utiliza `GET /api/notificaciones/contador` solo si `GET /api/sesion` no incluye `notificaciones_sin_leer`. El contrato documentado en el Módulo 0/README general es `{ "sin_leer": number }`.

## Decisiones de implementación

- La página consulta y valida `GET /api/sesion` mediante `protegerPagina` antes de dibujar la aplicación.
- Los contadores, mascotas y eventos se cargan de forma independiente. Un error en una sección no oculta el contenido válido de las demás.
- Cada sección tiene estado de carga, error con reintento y estado vacío cuando corresponde.
- Si el usuario no tiene mascotas, aparece la invitación a agregar la primera.
- Las tarjetas de mascotas están limitadas a tres registros, y los eventos se ordenan por fecha/hora antes de mostrarse.
- Los valores ausentes se muestran como no registrados; no se sustituyen por cifras o fechas de ejemplo.
- Los datos del servidor se insertan mediante `textContent` y creación de nodos. No se usa `innerHTML`.
- Las URLs de fotografías aceptan HTTPS o rutas del mismo origen. No se aceptan esquemas activos.
- Los enlaces `mascotas.html`, `mascota.html`, `citas.html`, `asistente.html` y `admin-usuarios.html` son destinos de módulos/páginas posteriores; no se crean aquí.
- No se modifica ningún archivo de estilo o lógica de los módulos anteriores, salvo la ampliación documentada de `js/api.js`.

## Verificaciones

Se debe servir el proyecto desde un origen HTTP(S), no abrir las páginas con `file://`, ya que se utilizan módulos ES y cookies de sesión. Se verifica sintaxis de JavaScript, balance básico de CSS, estructura HTML y que las rutas REST estén centralizadas en `js/api.js`. No se realizan pruebas de red contra un backend que todavía no está conectado.
