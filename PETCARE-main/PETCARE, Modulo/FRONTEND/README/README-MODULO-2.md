# PetCare — Módulo 2: autenticación

Este módulo agrega las páginas de inicio de sesión, registro y recuperación/restablecimiento de contraseña. Mantiene HTML5, CSS3 y JavaScript ES Modules, sin framework de interfaz. Todas las peticiones propias se realizan a través de `js/api.js`.

## Archivos del módulo

```text
petcare/
├── login.html
├── registro.html
├── recuperar.html
├── css/
│   └── auth.css
└── js/
    ├── api.js                 # actualizado: añade el recurso auth y adapta los accesos heredados
    └── auth.js
```

Se mantienen las carpetas, recursos y páginas de los módulos 0 y 1 dentro del paquete combinado.

## Rutas y contratos del backend

Todas las rutas usan JSON y cookie de sesión del mismo origen. Los errores deben conservar el formato `{ "error": "Mensaje", "campos": { "campo": "Mensaje de validación" } }`.

| Método | Ruta | Cuerpo JSON | Respuesta exitosa esperada |
|---|---|---|---|
| POST | `/api/auth/login` | `{ "correo": "...", "contrasena": "...", "recordarme": true }` | `{ "usuario": { "id", "nombre_completo", "correo", "rol", "foto_url", "activo" } }` y `Set-Cookie` de sesión. |
| POST | `/api/auth/google` | `{ "code": "código temporal de Google" }` | `{ "usuario": { ... } }` y `Set-Cookie`. El servidor intercambia y valida el código. La petición añade `X-Requested-With: XmlHttpRequest`; el servidor también comprueba el origen de la petición para proteger el flujo emergente frente a CSRF. |
| POST | `/api/auth/facebook` | `{ "access_token": "token temporal de Facebook" }` | `{ "usuario": { ... } }` y `Set-Cookie`. El servidor valida el token. |
| POST | `/api/auth/registro` | `{ "nombre_completo": "...", "correo": "...", "contrasena": "...", "acepta_terminos": true }` | `{ "mensaje": "..." }` y opcionalmente `{ "usuario": { ... } }`. No inicia sesión automáticamente. |
| POST | `/api/auth/recuperar` | `{ "correo": "..." }` | `{ "mensaje": "..." }`. La respuesta no debe revelar si el correo existe. |
| POST | `/api/auth/restablecer` | `{ "token": "...", "contrasena": "..." }` | `{ "mensaje": "..." }`. El token debe consumirse una sola vez. |
| GET | `/api/sesion` | Sin cuerpo | `{ "usuario": { ... }, "notificaciones_sin_leer": 0 }` según el contrato común de PetCare. |
| DELETE | `/api/sesion` | Sin cuerpo | `204` o `{ "mensaje": "..." }`. |

### Reglas que debe aplicar el servidor

- El servidor asigna siempre `rol = "usuario"` en el registro público. El frontend no envía selector ni valor de rol.
- `recordarme` afecta la duración de la cookie de sesión; no almacena contraseñas ni tokens en el navegador.
- La autenticación con Google intercambia el `code` mediante la configuración privada del servidor y verifica la identidad antes de crear/vincular una identidad externa. En este flujo emergente, el servidor debe validar el encabezado `X-Requested-With: XmlHttpRequest` y el origen esperado.
- La autenticación con Facebook verifica `access_token` con Meta desde el servidor. Nunca se confía solo en el nombre o correo entregado por el navegador.
- Las rutas sociales deben crear o localizar la identidad externa mediante `identidades_externas` y enlazarla al usuario local de forma segura.
- El backend registra el consentimiento de términos en `terminos_aceptados_en` al aceptar el registro; no debe confiar en una fecha enviada por el navegador.
- La recuperación genera un token aleatorio, de un solo uso, con expiración; almacena únicamente su hash y envía el enlace por correo. La respuesta debe ser genérica para evitar enumeración de cuentas.
- El restablecimiento comprueba expiración y uso previo, actualiza el hash de contraseña e invalida el token.
- Tras el login, la respuesta debe incluir `usuario.rol` con los valores `usuario` o `administrador`. El frontend redirige respectivamente a `/inicio.html` o `/admin-usuarios.html`.
- Los endpoints validan credenciales, permisos, proveedor, token, contraseña, términos y política de privacidad; la validación del navegador no sustituye ninguna de ellas.

## Configuración de inicio social

La página `login.html` contiene dos metadatos vacíos para valores públicos de configuración:

```html
<meta name="google-client-id" content="">
<meta name="facebook-app-id" content="">
```

Agrega los identificadores reales correspondientes antes de habilitar el acceso social. No escribas secretos de cliente ni secretos de aplicación en el HTML.

Google usa Google Identity Services con el flujo de código de autorización emergente. El código temporal se envía inmediatamente a `/api/auth/google` para que el backend lo intercambie y valide. Documentación oficial: <https://developers.google.com/identity/oauth2/web/guides/use-code-model>.

Facebook usa el SDK JavaScript oficial para obtener un `access_token` temporal y lo envía inmediatamente a `/api/auth/facebook`. La versión de Graph API configurada en `js/auth.js` es `v26.0`; revisa la versión habilitada en tu aplicación Meta antes de publicar. Documentación del SDK: <https://developers.facebook.com/docs/javascript/>.

Los SDK sociales se cargan únicamente en `login.html`. Si falta el identificador público o el SDK no está disponible, el usuario recibe un aviso en pantalla y puede seguir usando el acceso con correo y contraseña.

## Flujo de recuperación

1. `recuperar.html` muestra el formulario de correo cuando no recibe un parámetro `token`.
2. El servidor envía un enlace que apunta a `recuperar.html?token=...`.
3. Cuando la página detecta ese parámetro, oculta la solicitud de correo y muestra el formulario para definir la nueva contraseña.
4. `auth.js` conserva el token solo en memoria durante el envío. No lo escribe en `localStorage` ni `sessionStorage`.
5. Después de un restablecimiento correcto, limpia el parámetro de la barra de direcciones y permite volver al login.

## Validaciones de navegador

- Correo obligatorio y con formato válido.
- Campos obligatorios.
- Contraseña de al menos 8 caracteres como ayuda de interfaz.
- Confirmación de contraseña coincidente.
- Casilla de términos y privacidad obligatoria.
- Los errores del servidor `{ error, campos }` se presentan como mensajes globales y por campo.
- Los botones de envío se bloquean mientras existe una petición para evitar doble envío.

El mínimo de 8 caracteres es una regla de ayuda de la interfaz; el servidor debe definir y aplicar su política real de contraseña.

## Compatibilidad del esquema MySQL guardado

El esquema PetCare disponible en la documentación previa tiene algunas diferencias frente a los nombres de esta solicitud. Antes de conectar el backend, confirma y unifica estas referencias:

| Requisito de este módulo | Esquema guardado previamente |
|---|---|
| `identidades_externas` | No aparece entre las 19 tablas documentadas. |
| `tokens_usuario` | Aparece `TOKENS_RECUPERACION`, no `tokens_usuario`. |
| `terminos_aceptados_en` | En `USUARIOS` aparece `acepto_terminos_en`. |

Este frontend sigue los endpoints y contratos solicitados para el Módulo 2. No se ha inventado ni ejecutado SQL. El backend debe decidir si agrega las tablas/campos nuevos o adapta internamente los endpoints a las entidades ya existentes. No conectes los flujos sociales y de recuperación hasta resolver esta diferencia.

## Dependencias de páginas futuras

Los destinos `/inicio.html` y `/admin-usuarios.html` se crean en módulos posteriores. Los enlaces `/terminos.html` y `/privacidad.html` son referencias para las páginas legales que todavía no forman parte de esta entrega. No se han creado pantallas adicionales.

## Verificaciones realizadas

Se comprueba la sintaxis de los módulos JavaScript, el balance de llaves CSS y la estructura HTML básica. No se han probado credenciales reales, ventanas OAuth ni peticiones contra el backend: esos servicios requieren los identificadores de proveedor y la API configurada en tu servidor.
