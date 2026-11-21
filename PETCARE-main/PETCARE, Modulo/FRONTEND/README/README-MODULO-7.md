# PetCare — Módulo 7: Veterinarias

## Archivos

- `veterinarias.html`: página del directorio y punto de montaje del layout.
- `css/veterinarias.css`: estilos responsive del buscador, filtros, tarjetas, estados y modal.
- `js/veterinarias.js`: validación de sesión/rol, búsqueda, filtros, geolocalización y modal de información.
- `js/api.js`: copia completa del cliente API compartido, con los métodos y contratos de Veterinarias documentados.

## Integración

Copia `veterinarias.html` en la raíz del frontend, `veterinarias.css` en `css/`, `veterinarias.js` en `js/` y reemplaza `js/api.js` por el archivo de esta entrega. Conserva sin cambios los archivos compartidos `css/variables.css`, `css/base.css`, `css/componentes.css`, `js/sesion.js`, `js/layout.js` y `js/utils.js`.

La página sigue la estructura que ya usan los módulos anteriores: HTML en la raíz y los recursos separados en `css/` y `js/`. El servidor debe servir el frontend desde el mismo origen que `/api` para que se envíe la cookie de sesión con `credentials: "same-origin"`.

## Comportamiento

- Antes de montar la página se consulta `GET /api/sesion` mediante `protegerPagina`. Se admiten los roles `usuario` y `administrador`, ya que el directorio es un catálogo de consulta para ambos.
- El buscador consulta el servidor mediante `q` y permite buscar por nombre, dirección o ciudad. El backend debe aplicar el filtro sobre los campos disponibles.
- «Emergencias 24h» envía `24h=true`; puede combinarse con cualquiera de los órdenes.
- «Mejor valoradas» envía `orden=calificacion_promedio`; el backend debe ordenar de mayor a menor y tratar los registros sin calificación al final.
- «Más cercanas» solicita permiso solo después de que la persona activa el filtro. Si se permite, envía `orden=distancia`, `lat` y `lng`. El backend calcula la distancia a partir de `VETERINARIAS.latitud` y `VETERINARIAS.longitud` y devuelve los resultados ordenados. Las coordenadas no se guardan en almacenamiento web.
- Si la ubicación se deniega, no está disponible o se agota el tiempo, el filtro se desactiva y se muestra por qué no se puede ordenar por distancia; la búsqueda y los demás filtros siguen disponibles.
- Cada tarjeta muestra nombre, insignia 24h si el backend confirma ese dato, calificación y reseñas solo cuando existan, dirección, horario resumido y etiquetas cuando estén disponibles. No se sustituyen datos ausentes por ejemplos.
- «Ver info» consulta `GET /api/veterinarias/{id}` y abre un `<dialog>` accesible con contacto, horario por día y etiquetas. Los datos telefónico y correo se convierten en enlaces `tel:` y `mailto:` solo después de comprobar su formato.
- No hay botón para agendar citas ni operaciones de escritura sobre el catálogo.
- Todos los datos remotos se insertan mediante nodos y `textContent`, nunca con `innerHTML`.
- Se incluyen estados de carga, vacío, error con reintento y filtros sin resultados.

## Endpoints que debe implementar el servidor

### 1. `GET /api/sesion`

- Petición: sin cuerpo; la cookie de sesión viaja automáticamente.
- Respuesta esperada: `{ usuario: { id, nombre_completo, rol, ... }, notificaciones_sin_leer? }`.
- Autorización: sesión válida y usuario activo. El catálogo puede consultarse con los roles `usuario` y `administrador`.

### 2. `GET /api/veterinarias?q=&24h=&orden=&lat=&lng=`

- Petición: sin cuerpo. Todos los filtros son query params opcionales:
  - `q`: texto de búsqueda por `VETERINARIAS.nombre`, `VETERINARIAS.direccion` y `VETERINARIAS.ciudad`.
  - `24h=true`: únicamente veterinarias que atienden emergencias durante 24 horas.
  - `orden=calificacion_promedio`: ordenar de mayor a menor calificación.
  - `orden=distancia&lat={lat}&lng={lng}`: calcular la distancia respecto a la ubicación compartida y ordenar de menor a mayor distancia.
- Respuesta esperada: `{ datos: [{ id, nombre, direccion, ciudad, pais, telefono, correo, latitud, longitud, activa, atiende_24h?, calificacion_promedio?, numero_resenas?, etiquetas?, horario_resumen?, horarios?, distancia_km? }] }`.
- Los campos sin `?` proceden de `VETERINARIAS`. `horarios` procede de `HORARIOS_VETERINARIA`; el backend puede devolverlo para que el frontend arme el resumen. `horario_resumen` y `distancia_km` son alias calculados, no columnas.
- `etiquetas` debe ser una lista de textos. Puede derivarse de las especialidades no nulas de `VETERINARIOS.especialidad` asociadas a la veterinaria.
- El servidor devuelve solo veterinarias con `VETERINARIAS.activa = 1`. Para no divulgar información privada, no devuelve datos internos de administración.

### 3. `GET /api/veterinarias/{id}`

- Petición: sin cuerpo.
- Respuesta esperada: `{ veterinaria: { id, nombre, direccion, ciudad, pais, telefono, correo, latitud, longitud, activa, atiende_24h?, calificacion_promedio?, numero_resenas?, etiquetas? }, veterinarios: [{ id, nombre, especialidad, activo }], horarios: [{ id, veterinaria_id, dia_semana, hora_apertura, hora_cierre, duracion_cita_min }] }`.
- Los horarios proceden de `HORARIOS_VETERINARIA`. `dia_semana` usa 1 para lunes y 7 para domingo. Solo se muestran horarios registrados.
- El backend debe responder `404` si el registro no existe o no está activo, y errores en el formato común `{ error, campos }`.

## Diferencias detectadas en el esquema MySQL actual

El esquema adjunto define estas columnas de `VETERINARIAS`: `id`, `nombre`, `direccion`, `ciudad`, `pais`, `telefono`, `correo`, `latitud`, `longitud`, `activa` y `creado_en`. La tabla `HORARIOS_VETERINARIA` almacena `dia_semana`, `hora_apertura`, `hora_cierre` y `duracion_cita_min`.

El esquema **no contiene** `atiende_24h`, `calificacion_promedio`, `numero_resenas` ni una tabla de reseñas. Por eso el frontend no inventa ni persiste esos valores:

- Para habilitar el filtro y la insignia 24h, añade el atributo `atiende_24h` a `VETERINARIAS` o define una fuente calculada confiable en el backend.
- Para mostrar y ordenar por calificación y número de reseñas, necesitas una fuente de reseñas/calificaciones (por ejemplo, una nueva tabla y su agregación). Mientras no exista, el frontend mostrará «Calificación no disponible» y el orden por calificación no tendrá información real que ordenar.
- Las etiquetas pueden agregarse desde `VETERINARIOS.especialidad`; si decides otro significado para las etiquetas, el backend deberá entregar igualmente `etiquetas: string[]` sin inventar valores.

No se modifica el esquema MySQL ni se implementa backend dentro de este módulo. El frontend consume únicamente el contrato JSON documentado.

## Decisiones de implementación

- El orden por distancia se ejecuta en el servidor, que dispone de las coordenadas de las veterinarias; el navegador solo aporta las coordenadas después del permiso explícito.
- La ubicación no se solicita al cargar la página ni se almacena en `localStorage` o `sessionStorage`.
- Se permite combinar el filtro 24h con uno de los dos órdenes.
- La pantalla admite usuario y administrador como consulta de catálogo, pero no ofrece edición ni agendamiento.
- El resumen de horario puede venir del backend (`horario_resumen`) o construirse desde `HORARIOS_VETERINARIA`.
- No se incluyeron nombres, calificaciones, reseñas, direcciones, teléfonos, horarios ni etiquetas de demostración.
