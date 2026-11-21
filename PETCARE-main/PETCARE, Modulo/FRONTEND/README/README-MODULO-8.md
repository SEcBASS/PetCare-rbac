# PetCare — Módulo 8: Asistente IA

## Archivos

- `asistente.html`: página y punto de montaje del layout compartido.
- `css/asistente.css`: estilos responsive del encabezado degradado, panel de historial, chat, burbujas, preguntas sugeridas y aviso inferior.
- `js/asistente.js`: protección de sesión, consulta de mascotas, saludo personalizado, historial, selección de conversación, selector de contexto y envío de mensajes.
- `js/api.js`: copia completa y actualizada del cliente API compartido; incluye los tres métodos del contrato del Asistente IA.

## Integración

Copia `asistente.html` en la raíz del frontend, `asistente.css` en `css/`, `asistente.js` en `js/` y reemplaza `js/api.js` por el archivo de esta entrega. Conserva sin cambios los archivos compartidos `css/variables.css`, `css/base.css`, `css/componentes.css`, `js/sesion.js`, `js/layout.js` y `js/utils.js`.

La página sigue la estructura actual de PetCare: los HTML están en la raíz y los estilos/lógica en sus carpetas. Debe servirse desde el mismo origen que `/api` para que se envíe la cookie de sesión mediante `credentials: "same-origin"`.

## Comportamiento

- Antes de montar la interfaz se consulta `GET /api/sesion` mediante `protegerPagina`. El módulo admite únicamente el rol `usuario`; el servidor sigue siendo responsable de autorizar cada endpoint.
- Se consultan `GET /api/mascotas?activa=true` y `GET /api/asistente/conversaciones` por separado. Un fallo de una de estas secciones no bloquea el uso de la otra.
- El mensaje de bienvenida utiliza los nombres que realmente devuelve el catálogo de mascotas del usuario. Si no tiene mascotas, muestra una bienvenida general; si falla la consulta, indica que no fue posible recuperar los nombres.
- El selector permite enviar una mascota como contexto o dejarlo vacío. No se guarda la selección en `localStorage` ni en `sessionStorage`.
- Las cuatro preguntas sugeridas colocan su texto en el compositor y ejecutan el mismo flujo de envío que una pregunta escrita.
- Enter envía y Shift+Enter conserva el salto de línea. Se bloquea el doble envío mientras una solicitud está en curso.
- Al iniciar una conversación nueva, el primer `POST /api/asistente/mensajes` incluye `conversacion_id: null`. El servidor crea la conversación y devuelve su identificador. Los envíos siguientes usan ese identificador.
- Las conversaciones anteriores se recuperan con `GET /api/asistente/conversaciones`; al seleccionar una se consultan sus mensajes con `GET /api/asistente/conversaciones/{id}`.
- El indicador «PetCare AI está escribiendo…» permanece visible mientras el servidor procesa el mensaje.
- Las respuestas de alcance permitido y los avisos de fuera de tema se presentan como texto normal en una burbuja del asistente. El control de alcance para perros y gatos debe ejecutarlo el backend/servicio local de IA; el navegador no intenta clasificar ni reescribir la pregunta.
- Todos los mensajes remotos se insertan mediante nodos y `textContent`, nunca con `innerHTML`.
- El aviso «PetCare AI proporciona información general y no sustituye a un veterinario» permanece visible en el pie del panel de chat.
- Se contemplan carga, error con reintento del historial, error de detalle, error de envío y ausencia de conversaciones/mascotas.

## Endpoints que debe implementar el servidor

### 1. `GET /api/sesion`

- Petición: sin cuerpo; la cookie de sesión viaja automáticamente.
- Respuesta esperada: `{ usuario: { id, nombre_completo, rol, ... }, notificaciones_sin_leer? }`.
- Autorización: sesión válida, usuario activo y rol `usuario`.

### 2. `GET /api/mascotas?activa=true`

- Petición: sin cuerpo; query `activa=true`.
- Respuesta esperada: `{ datos: [{ id, nombre, especie_id, nombre_especie? }] }`.
- El servidor devuelve únicamente mascotas activas del usuario autenticado. `nombre_especie` es un alias de consulta opcional derivado de `ESPECIES`; no es una columna nueva de `MASCOTAS`.

### 3. `GET /api/asistente/conversaciones`

- Petición: sin cuerpo.
- Respuesta esperada: `{ datos: [{ id, titulo, mascota_id, creado_en, actualizado_en }] }`.
- El servidor devuelve solo las conversaciones del usuario autenticado y las ordena por `actualizado_en` descendente.

### 4. `GET /api/asistente/conversaciones/{id}`

- Petición: sin cuerpo.
- Respuesta esperada: `{ conversacion: { id, titulo, mascota_id, creado_en, actualizado_en }, mensajes: [{ id, rol, contenido, creado_en }] }`.
- `rol` identifica `usuario` o `asistente`. `contenido` es el texto que se guardó para cada mensaje.
- El servidor verifica que la conversación solicitada pertenezca al usuario autenticado; debe responder `404` cuando no exista o no pertenezca a la cuenta.

### 5. `POST /api/asistente/mensajes`

- Cuerpo JSON: `{ conversacion_id: number|null, mascota_id: number|null, texto: string }`.
- Respuesta exitosa: `{ conversacion_id: number, respuesta: string }`.
- Si `conversacion_id` llega como `null`, el servidor crea una conversación nueva. En todos los casos guarda el mensaje de usuario y el de asistente en el historial, actualiza la conversación y devuelve el identificador.
- `mascota_id` puede ser `null`; si contiene un ID, el servidor verifica que esa mascota pertenezca al usuario y sea un perro o gato.
- El servicio local de Python recibe el texto y el contexto de mascota seleccionado. Su instrucción de sistema debe limitar las respuestas al cuidado de perros y gatos. Cuando detecte una pregunta fuera de tema, debe devolver un aviso explicativo en `respuesta` (string); el frontend lo mostrará como cualquier otro mensaje del asistente.
- El servidor no debe devolver trazas, credenciales ni datos internos del motor. Los errores HTTP usan el formato común `{ error, campos }`.

## Persistencia y diferencia con el esquema MySQL anterior

La solicitud de este módulo nombra las tablas `chat_conversaciones` y `chat_mensajes`. El esquema MySQL que se había adjuntado anteriormente no contiene esos nombres: define `CONVERSACIONES_IA` y `MENSAJES_IA`, con campos `titulo`, `mascota_id`, `rol`, `contenido`, `creado_en` y `actualizado_en`.

El frontend implementa el contrato HTTP solicitado (`/api/asistente/...`) y no ejecuta SQL. Para que funcione, el backend debe decidir una sola estrategia antes de conectar la base de datos:

1. Crear/adaptar las tablas `chat_conversaciones` y `chat_mensajes` con los campos que necesite este contrato; o
2. Mantener las tablas existentes `CONVERSACIONES_IA` y `MENSAJES_IA` y hacer que el repositorio del backend traduzca las rutas y propiedades de la API a esos nombres/campos.

No se cambia ni se presume modificado el esquema MySQL desde el frontend.

## Decisiones y límites

- No se incluye un endpoint extra para crear conversaciones. El primer envío con `conversacion_id: null` solicita al servidor crearla y persistir el primer intercambio.
- La aplicación no genera mascotas, conversaciones ni mensajes ficticios. Los únicos nombres del saludo proceden de `GET /api/mascotas`.
- El usuario puede consultar su historial, pero no editar ni borrar conversaciones desde esta pantalla.
- El módulo no conecta directamente con LM Studio, Gemma ni otro motor. Consume el endpoint REST que el propietario del backend conectará al servicio local Python.
- El asistente no diagnostica ni sustituye la valoración de un profesional veterinario; esta advertencia permanece visible en la interfaz.
- Se protege la página con la sesión del servidor. La autorización y la pertenencia de mascotas/conversaciones se vuelven a comprobar en cada endpoint del backend.
- No se modifica ningún módulo anterior salvo la ampliación de `js/api.js` con el contrato de este asistente.

## Verificaciones

La sintaxis de JavaScript se comprueba con Node.js y la estructura HTML/CSS se revisa localmente. No se prueba la conexión de red, persistencia ni respuesta del servicio de IA porque el backend todavía debe implementarlos.
