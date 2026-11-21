# PetCare — Módulo 10: Mi perfil y Configuración

## Archivos de esta entrega

### Páginas y módulos nuevos

- `perfil.html`: página protegida de perfil personal.
- `css/perfil.css`: estilos del avatar, resumen, información personal, formulario de edición y accesos rápidos.
- `js/perfil.js`: carga del perfil, edición, selección y envío de avatar, validación de apoyo y actualización del layout.
- `configuracion.html`: página protegida con cuatro pestañas: Cuenta, Notificaciones, Privacidad y Seguridad.
- `css/configuracion.css`: estilos responsive de pestañas, interruptores, formularios y zona de eliminación.
- `js/configuracion.js`: preferencias con guardado inmediato y reversión, cambio de contraseña y eliminación confirmada de cuenta.

### Archivo compartido actualizado

- `js/api.js`: conserva los métodos de los módulos anteriores e incorpora `api.perfil.obtener`, `api.perfil.actualizar`, `api.perfil.cambiarContrasena` y `api.cuenta.eliminar`. Se conserva `api.preferencias`.

No se modifica `layout.js`, `componentes.css`, `sesion.js`, `utils.js` ni los módulos anteriores.

## Instalación

Copia los archivos respetando estas rutas en el frontend actual:

```text
PetCare/
├── perfil.html
├── configuracion.html
├── css/
│   ├── perfil.css
│   └── configuracion.css
└── js/
    ├── perfil.js
    ├── configuracion.js
    └── api.js                 (reemplazar por la versión incluida)
```

Las páginas HTML permanecen en la raíz, igual que los módulos 0–9. El frontend y `/api` deben servirse desde el mismo origen para enviar la cookie de sesión con `credentials: "same-origin"`.

## Mi perfil

- Se permite la página a los roles `usuario` y `administrador`; el servidor mantiene la autorización real.
- `GET /api/perfil` carga los campos públicos de `USUARIOS`.
- El avatar muestra la foto de `USUARIOS.foto_url` o las iniciales del nombre si no existe foto.
- El selector acepta JPG, PNG y WebP de máximo 4 MB. La imagen se envía como Base64 dentro de JSON; el servidor debe almacenarla y actualizar `USUARIOS.foto_url`.
- El formulario edita nombre, correo, teléfono, ciudad y país. El país se envía como código de dos letras porque `USUARIOS.pais` es `CHAR(2)`.
- `creado_en` se presenta como «Miembro desde»; no se usa `acepto_terminos_en` para ese dato.
- Después de actualizar el perfil, se refresca el nombre y avatar del layout compartido.
- Los accesos rápidos llevan a Seguridad, Configuración y Notificaciones.

### Endpoints de perfil

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| GET | `/api/perfil` | Ninguno; cookie de sesión | `{ perfil: { id, nombre_completo, correo, telefono, ciudad, pais, foto_url, rol, creado_en } }` |
| PUT | `/api/perfil` | `{ nombre_completo, correo, telefono?, ciudad?, pais?, foto? }` | `{ perfil }` |

La propiedad opcional `foto` tiene esta estructura: `{ nombre, tipo, contenido_base64 }`. Si no se cambia la foto, no se envía esa propiedad. El backend valida tamaño/tipo otra vez, almacena el archivo y devuelve la URL pública en `foto_url`. No debe devolver `password_hash`.

## Configuración

La interfaz utiliza los campos reales de `CONFIGURACION_USUARIO`, no una tabla `preferencias_usuario` adicional.

### Pestaña Notificaciones

Interruptores respaldados por columnas existentes:

| Campo MySQL | Etiqueta |
|---|---|
| `confirmacion_cita` | Confirmación de cita |
| `recordatorio_cita_24h` | Recordatorio de cita 24 horas antes |
| `notificaciones_push` | Notificaciones push |
| `notificaciones_correo` | Notificaciones por correo |
| `actualizaciones_petcare` | Actualizaciones de PetCare |

Cada cambio realiza `PATCH /api/preferencias` con un único campo. El control queda temporalmente deshabilitado mientras guarda, muestra el resultado y vuelve al valor anterior si el servidor responde con error.

El esquema no contiene columnas para preferencias individuales de recordatorio de vacunas, alerta de vacunas el día anterior ni vacunas vencidas. Por eso no se crean interruptores ficticios para esas opciones. El backend podría generar alertas globales de vacunas, pero para que el usuario configure cada una habría que ampliar `CONFIGURACION_USUARIO` con una migración y definir su contrato.

### Pestaña Privacidad

| Campo MySQL | Etiqueta |
|---|---|
| `perfil_publico` | Perfil público |
| `compartir_datos_anonimos` | Compartir datos anónimos |

También se guardan al instante mediante `PATCH /api/preferencias`.

### Pestaña Seguridad

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| POST | `/api/perfil/contrasena` | `{ contrasena_actual, contrasena_nueva }` | `{ mensaje }` |

La confirmación de contraseña se compara en el navegador y no se envía. El backend verifica la contraseña actual, aplica la política de seguridad y nunca devuelve el hash.

### Pestaña Cuenta

| Método | Ruta | Cuerpo | Respuesta exitosa |
|---|---|---|---|
| DELETE | `/api/cuenta` | `{ correo_confirmacion }` | `204` o `{ mensaje }` |

La pantalla habilita el botón únicamente cuando el correo escrito coincide con el devuelto por `GET /api/perfil`, y solicita una confirmación final del navegador. El backend debe volver a verificar la identidad desde la sesión y el correo recibido; nunca debe confiar solo en la comprobación del cliente. Tras la respuesta exitosa se limpia el estado local y se redirige al login.

## Endpoints compartidos

Además de los endpoints específicos, ambas páginas consultan:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/sesion` | Verificar la sesión y el rol antes de montar la página |
| GET | `/api/preferencias` | Obtener los campos de `CONFIGURACION_USUARIO` |
| PATCH | `/api/preferencias` | Guardar uno o varios campos existentes de `CONFIGURACION_USUARIO` |

Respuesta de preferencias: `{ preferencias: { usuario_id, confirmacion_cita, recordatorio_cita_24h, recordatorio_cita_1h, notificaciones_push, notificaciones_correo, actualizaciones_petcare, perfil_publico, compartir_datos_anonimos, actualizado_en } }`. Los valores booleanos pueden llegar como `0/1` o `false/true`; el frontend admite ambas formas. Aunque `recordatorio_cita_1h` existe en la base, no se expone en esta pantalla porque no forma parte de las opciones solicitadas.

## Errores y seguridad

- Mantener el formato de error compartido: `{ error, campos }`.
- Una sesión ausente debe responder `401`; un usuario sin permisos, `403`; los errores de validación deben usar estados 4xx.
- El backend debe obtener el `usuario_id` únicamente de la sesión para leer y actualizar `USUARIOS` y `CONFIGURACION_USUARIO`.
- No aceptar `rol`, `usuario_id`, `password_hash` ni `creado_en` como campos editables del perfil.
- El endpoint de cambio de contraseña debe verificar la contraseña actual y aplicar la política definida por el servidor.
- La eliminación debe ejecutarse con transacción y las reglas referenciales de MySQL; no confiar solo en la confirmación del navegador.
- El frontend no guarda contraseñas, tokens ni datos de sesión en `localStorage` o `sessionStorage`.
- Todos los datos remotos se muestran con nodos DOM y `textContent`; no se usa `innerHTML`.

## Decisiones y límites

- La navegación y el control de sesión se reutilizan desde el layout compartido.
- El perfil usa `USUARIOS.creado_en` como fecha de membresía.
- El país usa el formato de dos letras que define el esquema.
- La subida de avatar usa el mismo patrón de archivo Base64 documentado para otros recursos PetCare; el almacenamiento físico y su URL quedan a cargo del servidor.
- No se incluye una pestaña «Preferencias».
- No se agregaron columnas ni respuestas simuladas.
- El frontend espera que `GET /api/preferencias` devuelva todas las columnas de configuración; si un campo no viene, el control correspondiente queda deshabilitado en vez de asumir un valor.

## Verificaciones

Se revisarán sintaxis JavaScript, balance CSS, estructura HTML y contenido del ZIP. No se prueba la conexión real con FastAPI/MySQL porque el backend no está conectado en esta entrega.
