/**
 * Cliente HTTP único de PetCare.
 * Todas las peticiones usan JSON y la cookie de sesión administrada por el servidor.
 * Este archivo no guarda tokens, no simula respuestas y no realiza validaciones de autorización.
 */

const API_BASE = "/api";

/** Error normalizado para conservar el formato que devuelve el servidor: { error, campos }. */
export class ApiError extends Error {
  constructor({ mensaje, status, error, campos, respuesta }) {
    super(mensaje || error || "No fue posible completar la solicitud.");
    this.name = "ApiError";
    this.status = status;
    this.error = error || this.message;
    this.campos = campos && typeof campos === "object" ? campos : {};
    this.respuesta = respuesta ?? null;
  }
}

/** Convierte parámetros de consulta en una cadena URL, omitiendo valores vacíos. */
function crearQuery(parametros = {}) {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") {
      query.set(clave, String(valor));
    }
  }
  const resultado = query.toString();
  return resultado ? `?${resultado}` : "";
}

/**
 * Ejecuta una petición REST.
 * @param {string} ruta Ruta relativa a /api.
 * @param {{method?: string, body?: object, signal?: AbortSignal, headers?: Record<string, string>}} opciones Opciones HTTP.
 * @returns {Promise<unknown>} Cuerpo JSON del servidor o null para respuestas sin contenido.
 * @throws {ApiError} Cuando el servidor responde con un estado no exitoso o un JSON inválido.
 */
async function solicitar(ruta, opciones = {}) {
  const { method = "GET", body, signal, headers: encabezadosAdicionales = {} } = opciones;
  const encabezados = { Accept: "application/json", ...encabezadosAdicionales };

  if (body !== undefined) {
    encabezados["Content-Type"] = "application/json";
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      method,
      headers: encabezados,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError({ mensaje: "No se pudo conectar con el servidor de PetCare." });
  }

  let datos = null;
  if (respuesta.status !== 204) {
    const tipoContenido = respuesta.headers.get("content-type") || "";
    if (tipoContenido.includes("application/json")) {
      try {
        datos = await respuesta.json();
      } catch {
        throw new ApiError({
          mensaje: "El servidor devolvió una respuesta JSON que no se pudo leer.",
          status: respuesta.status
        });
      }
    } else {
      const texto = await respuesta.text();
      datos = texto ? { error: texto } : null;
    }
  }

  if (!respuesta.ok) {
    throw new ApiError({
      mensaje: datos?.error || `La solicitud falló (${respuesta.status}).`,
      status: respuesta.status,
      error: datos?.error,
      campos: datos?.campos,
      respuesta: datos
    });
  }

  return datos;
}

/** Construye rutas con identificadores seguros para segmentos URL. */
function idEnRuta(id) {
  if (id === undefined || id === null || id === "") {
    throw new TypeError("Se requiere un identificador para esta operación.");
  }
  return encodeURIComponent(String(id));
}

export const api = {
  auth: {
    /**
     * POST /api/auth/login.
     * Cuerpo: { correo, contrasena, recordarme }.
     * Respuesta: { usuario: { id, nombre_completo, correo, rol, foto_url, activo } } y cookie de sesión.
     * El servidor comprueba credenciales y decide la duración de la cookie según recordarme.
     */
    iniciar: (datos) => solicitar("/auth/login", { method: "POST", body: datos }),

    /**
     * POST /api/auth/google.
     * Cuerpo: { code } con el código temporal devuelto por Google Identity Services.
     * Encabezado: X-Requested-With: XmlHttpRequest para la verificación CSRF del flujo emergente.
     * Respuesta: { usuario } y cookie de sesión; el servidor intercambia y valida el código.
     */
    iniciarGoogle: (datos) => solicitar("/auth/google", {
      method: "POST",
      body: datos,
      headers: { "X-Requested-With": "XmlHttpRequest" }
    }),

    /**
     * POST /api/auth/facebook.
     * Cuerpo: { access_token } temporal devuelto por Facebook Login.
     * Respuesta: { usuario } y cookie de sesión; el servidor valida el token con Meta.
     */
    iniciarFacebook: (datos) => solicitar("/auth/facebook", { method: "POST", body: datos }),

    /**
     * POST /api/auth/registro.
     * Cuerpo: { nombre_completo, correo, contrasena, acepta_terminos }.
     * Respuesta: { usuario } o { mensaje }. El servidor asigna rol=usuario y guarda terminos_aceptados_en.
     */
    registrar: (datos) => solicitar("/auth/registro", { method: "POST", body: datos }),

    /** POST /api/auth/recuperar. Cuerpo: { correo }. Respuesta: { mensaje }. El servidor genera y envía un enlace con token de un solo uso. */
    solicitarRecuperacion: (datos) => solicitar("/auth/recuperar", { method: "POST", body: datos }),

    /** POST /api/auth/restablecer. Cuerpo: { token, contrasena }. Respuesta: { mensaje }. El token solo vive en la URL y memoria durante el flujo. */
    restablecer: (datos) => solicitar("/auth/restablecer", { method: "POST", body: datos })
  },

  sesion: {
    /** GET /api/sesion. Cuerpo: ninguno. Respuesta: { usuario: { id, nombre_completo, correo, rol, foto_url, activo }, notificaciones_sin_leer }. */
    obtener: () => solicitar("/sesion"),

    /** Compatibilidad con páginas que necesiten iniciar sesión: delega en POST /api/auth/login. Cuerpo: { correo, contrasena, recordarme }. Respuesta: { usuario } y cookie. */
    iniciar: (datos) => solicitar("/auth/login", { method: "POST", body: datos }),

    /** DELETE /api/sesion. Cuerpo: ninguno. Respuesta: 204 o { mensaje }. Revoca la sesión de la cookie actual. */
    cerrar: () => solicitar("/sesion", { method: "DELETE" }),

    /** Compatibilidad de registro: POST /api/auth/registro. Cuerpo: { nombre_completo, correo, contrasena, acepta_terminos }. Respuesta: { usuario } o { mensaje }. */
    registrar: (datos) => solicitar("/auth/registro", { method: "POST", body: datos }),

    /** Compatibilidad de recuperación: POST /api/auth/recuperar. Cuerpo: { correo }. Respuesta: { mensaje }. */
    solicitarRecuperacion: (datos) => solicitar("/auth/recuperar", { method: "POST", body: datos }),

    /** Compatibilidad de restablecimiento: POST /api/auth/restablecer. Cuerpo: { token, contrasena }. Respuesta: { mensaje }. */
    restablecerContrasena: (token, datos) => solicitar("/auth/restablecer", { method: "POST", body: { ...datos, token } })
  },

  mascotas: {
    /**
     * GET /api/mascotas.
     * Cuerpo: ninguno; filtros opcionales por query string.
     * Respuesta: { datos: [campos de MASCOTAS y alias de presentación] }.
     * El servidor filtra siempre por el dueño autenticado y puede incluir datos de v_mascotas_resumen.
     */
    listar: (parametros = {}) => solicitar(`/mascotas${crearQuery(parametros)}`),

    /** GET /api/mascotas/{id}. Cuerpo: ninguno. Respuesta: { mascota } con sus relaciones de catálogo visibles al dueño. */
    obtener: (id) => solicitar(`/mascotas/${idEnRuta(id)}`),

    /**
     * POST /api/mascotas.
     * Cuerpo JSON: { nombre, especie_id, raza_id?, sexo, color?, fecha_nacimiento?, fecha_ingreso?, estado_salud, foto?, foto_url?, notas? }.
     * foto es opcional y, cuando existe, contiene { nombre, tipo, contenido_base64 } para que el servidor almacene el archivo
     * y guarde su URL en MASCOTAS.foto_url. Respuesta: { mascota }.
     * El servidor asigna usuario_id desde la sesión y activa=1; nunca acepta el dueño desde el navegador.
     */
    crear: (datos) => solicitar("/mascotas", { method: "POST", body: datos }),

    /**
     * PUT /api/mascotas/{id}.
     * Cuerpo JSON: campos editables de MASCOTAS; puede incluir foto { nombre, tipo, contenido_base64 } o foto_url: null para quitarla.
     * Respuesta: { mascota }. El servidor verifica que el registro pertenezca al usuario autenticado.
     */
    actualizar: (id, datos) => solicitar(`/mascotas/${idEnRuta(id)}`, { method: "PUT", body: datos }),

    /**
     * DELETE /api/mascotas/{id}.
     * Cuerpo: ninguno. Respuesta: 204 o { mascota }.
     * El backend realiza borrado lógico asignando MASCOTAS.activa = 0; no elimina físicamente la fila.
     */
    desactivar: (id) => solicitar(`/mascotas/${idEnRuta(id)}`, { method: "DELETE" })
  },

  pesos: {
    /** GET /api/mascotas/{mascotaId}/pesos. Cuerpo: ninguno. Respuesta: { datos: [id, mascota_id, peso_kg, medido_en, creado_en] }. */
    listar: (mascotaId, parametros = {}) => solicitar(`/mascotas/${idEnRuta(mascotaId)}/pesos${crearQuery(parametros)}`),

    /** POST /api/mascotas/{mascotaId}/pesos. Cuerpo: { peso_kg, medido_en }. Respuesta: { peso }. */
    registrar: (mascotaId, datos) => solicitar(`/mascotas/${idEnRuta(mascotaId)}/pesos`, { method: "POST", body: datos }),

    /** PATCH /api/pesos/{id}. Cuerpo: { peso_kg?, medido_en? }. Respuesta: { peso }. Se conserva para usos posteriores que permitan editar mediciones. */
    actualizar: (id, datos) => solicitar(`/pesos/${idEnRuta(id)}`, { method: "PATCH", body: datos })
  },

  recordatorios: {
    /** GET /api/recordatorios. Cuerpo: ninguno. Respuesta: { datos: [campos de RECORDATORIOS] }. Método general conservado para otros módulos. */
    listar: (parametros = {}) => solicitar(`/recordatorios${crearQuery(parametros)}`),

    /** POST /api/recordatorios. Cuerpo: campos de RECORDATORIOS. Respuesta: { recordatorio }. Método general conservado para otros módulos. */
    crear: (datos) => solicitar("/recordatorios", { method: "POST", body: datos }),

    /** PATCH /api/recordatorios/{id}. Cuerpo: campos editables de RECORDATORIOS. Respuesta: { recordatorio }. */
    actualizar: (id, datos) => solicitar(`/recordatorios/${idEnRuta(id)}`, { method: "PATCH", body: datos }),

    /** PATCH /api/recordatorios/{id}/completado. Cuerpo: { completado: true|false }. Respuesta: { recordatorio }. Compatibilidad con el contrato previo. */
    cambiarCompletado: (id, completado) => solicitar(`/recordatorios/${idEnRuta(id)}/completado`, { method: "PATCH", body: { completado: Boolean(completado) } }),

    /** GET /api/mascotas/{mascotaId}/recordatorios. Cuerpo: ninguno. Respuesta: { datos: [campos de RECORDATORIOS] }. */
    listarPorMascota: (mascotaId, parametros = {}) => solicitar(`/mascotas/${idEnRuta(mascotaId)}/recordatorios${crearQuery(parametros)}`),

    /** POST /api/mascotas/{mascotaId}/recordatorios. Cuerpo: { tipo, titulo, descripcion?, fecha_hora }. Respuesta: { recordatorio }. */
    crearParaMascota: (mascotaId, datos) => solicitar(`/mascotas/${idEnRuta(mascotaId)}/recordatorios`, { method: "POST", body: datos }),

    /** PATCH /api/recordatorios/{id}/completar. Cuerpo: ninguno. Respuesta: { recordatorio } con completado=1. */
    completar: (id) => solicitar(`/recordatorios/${idEnRuta(id)}/completar`, { method: "PATCH" })
  },

  citas: {
    /**
     * GET /api/citas?mes=AAAA-MM&mascota_id={id}.
     * Cuerpo: ninguno. Ambos parámetros son opcionales; sin mes devuelve las citas del usuario para la vista de lista,
     * y con mes devuelve las citas del periodo para el calendario. mascota_id filtra por una mascota concreta.
     * Respuesta: { datos: [{ id, mascota_id, nombre_mascota?, motivo_id, nombre_motivo?, nombre_veterinaria?, fecha_cita, hora_cita, estado }] }.
     * Los nombres de relaciones son alias calculados por el servidor; las columnas persistidas mantienen los nombres de CITAS.
     * El servidor debe limitar los resultados a las mascotas del usuario autenticado.
     */
    listar: (parametros = {}) => solicitar(`/citas${crearQuery(parametros)}`),

    /** GET /api/citas?mes=AAAA-MM&mascota_id={id}. Cuerpo: ninguno. Respuesta: { datos: [citas del mes] }. */
    listarMes: (mes, mascotaId) => solicitar(`/citas${crearQuery({ mes, mascota_id: mascotaId })}`)
  },

  vacunas: {
    /**
     * GET /api/vacunas?mascota_id={id}&estado={estado}.
     * Cuerpo: ninguno. Ambos filtros son opcionales; estado admite al_dia, proxima o vencida/pendiente.
     * Respuesta: { datos: [{ id, mascota_id, nombre_mascota, vacuna_id, nombre_vacuna, fecha_aplicacion,
     *   proxima_dosis, estado, dias_para_proxima, nombre_veterinaria, nombre_veterinario, lote, notas }] }.
     * Los campos de nombres, estado y días son alias de consulta basados en la vista de estado de vacunaciones.
     * El servidor limita siempre los resultados a mascotas del usuario autenticado.
     */
    listarCarnet: (parametros = {}) => solicitar(`/vacunas${crearQuery(parametros)}`),

    /** GET /api/vacunaciones?mascota_id={id}. Cuerpo: ninguno. Respuesta: { datos: [campos de VACUNACIONES] }. Se conserva para el perfil de mascota. */
    listarAplicaciones: (parametros = {}) => solicitar(`/vacunaciones${crearQuery(parametros)}`)
  },

  catalogos: {
    /** GET /api/especies. Cuerpo: ninguno. Respuesta: { datos: [campos de ESPECIES] }. Catálogo de solo lectura para usuarios. */
    listarEspecies: () => solicitar("/especies"),

    /** GET /api/razas?especie_id={id}. Cuerpo: ninguno. Respuesta: { datos: [campos de RAZAS] }. */
    listarRazas: (parametros = {}) => solicitar(`/razas${crearQuery(parametros)}`),

    /** GET /api/motivos-consulta. Cuerpo: ninguno. Respuesta: { datos: [campos de MOTIVOS_CONSULTA] }. */
    listarMotivosConsulta: () => solicitar("/motivos-consulta")
  },

  veterinarias: {
    /**
     * GET /api/veterinarias?q=&24h=&orden=&lat=&lng=.
     * Cuerpo: ninguno. Todos los parámetros son opcionales:
     * q busca por nombre, dirección o ciudad; 24h=true filtra atención continua;
     * orden admite calificacion_promedio o distancia; lat y lng son coordenadas
     * entregadas por el navegador únicamente cuando el usuario activa «Más cercanas».
     * Respuesta: { datos: [{ id, nombre, direccion, ciudad, pais, telefono, correo,
     *   latitud, longitud, activa, atiende_24h?, calificacion_promedio?, numero_resenas?,
     *   etiquetas?, horario_resumen?, horarios?, distancia_km? }] }.
     * Los atributos marcados con ? son alias opcionales de presentación del backend,
     * no columnas existentes en VETERINARIAS. El servidor devuelve solo registros activos.
     * opciones admite signal para cancelar solicitudes obsoletas.
     */
    listar: (parametros = {}, opciones = {}) => solicitar(`/veterinarias${crearQuery(parametros)}`, opciones),

    /**
     * GET /api/veterinarias/{id}.
     * Cuerpo: ninguno. Respuesta: { veterinaria: { campos de VETERINARIAS y alias opcionales },
     *   veterinarios: [{ id, nombre, especialidad, activo }],
     *   horarios: [{ id, veterinaria_id, dia_semana, hora_apertura, hora_cierre, duracion_cita_min }] }.
     * Los horarios proceden de HORARIOS_VETERINARIA. opciones admite signal.
     */
    obtener: (id, opciones = {}) => solicitar(`/veterinarias/${idEnRuta(id)}`, opciones)
  },

  notificaciones: {
    /**
     * GET /api/notificaciones?leidas={true|false}.
     * Cuerpo: ninguno. Si leidas se omite, devuelve todas; false devuelve solo no leídas y true solo leídas.
     * Respuesta: { datos: [{ id, usuario_id, tipo, titulo, mensaje, leida, mascota_id,
     *   vacunacion_id, cita_id, creado_en }] } ordenados por creado_en descendente.
     * Los enlaces relacionados se resuelven usando los identificadores existentes de NOTIFICACIONES.
     */
    listar: (parametros = {}, opciones = {}) => solicitar(`/notificaciones${crearQuery(parametros)}`, opciones),

    /**
     * Cuenta las notificaciones no leídas mediante el mismo recurso de listado.
     * No requiere un endpoint adicional: GET /api/notificaciones?leidas=false.
     * Respuesta local: { sin_leer: number } calculada a partir de { datos: [...] }.
     */
    contarSinLeer: async (opciones = {}) => {
      const respuesta = await solicitar(`/notificaciones${crearQuery({ leidas: false })}`, opciones);
      const datos = Array.isArray(respuesta?.datos) ? respuesta.datos : Array.isArray(respuesta) ? respuesta : [];
      return { sin_leer: datos.length };
    },

    /** PATCH /api/notificaciones/{id}/leer. Cuerpo: ninguno. Respuesta: { notificacion } o 204. El servidor valida la propiedad del registro. */
    marcarLeida: (id) => solicitar(`/notificaciones/${idEnRuta(id)}/leer`, { method: "PATCH" }),

    /** PATCH /api/notificaciones/leer-todas. Cuerpo: ninguno. Respuesta: { actualizadas: number }. Solo afecta notificaciones del usuario autenticado. */
    marcarTodasLeidas: () => solicitar("/notificaciones/leer-todas", { method: "PATCH" })
  },

  asistente: {
    /**
     * GET /api/asistente/conversaciones.
     * Cuerpo: ninguno. Respuesta: { datos: [{ id, titulo?, mascota_id?, creado_en?, actualizado_en? }] }.
     * El servidor devuelve únicamente conversaciones del usuario autenticado, ordenadas por actualización reciente.
     */
    listarConversaciones: (opciones = {}) => solicitar("/asistente/conversaciones", opciones),

    /**
     * GET /api/asistente/conversaciones/{id}.
     * Cuerpo: ninguno. Respuesta: { conversacion: { id, titulo?, mascota_id?, creado_en?, actualizado_en? },
     *   mensajes: [{ id, rol, contenido, creado_en }] }.
     * El servidor verifica que la conversación pertenezca a la cuenta autenticada.
     */
    obtenerConversacion: (id, opciones = {}) => solicitar(`/asistente/conversaciones/${idEnRuta(id)}`, opciones),

    /**
     * POST /api/asistente/mensajes.
     * Cuerpo: { conversacion_id: number|null, mascota_id: number|null, texto: string }.
     * Respuesta: { conversacion_id: number, respuesta: string }.
     * Si conversacion_id es null, el servidor crea una conversación y almacena ambos mensajes antes de responder.
     * El backend conecta el motor local de IA, limita el tema a perros y gatos y devuelve también como texto
     * normal cualquier respuesta que indique que la pregunta está fuera de ese ámbito.
     */
    enviarMensaje: (datos, opciones = {}) => solicitar("/asistente/mensajes", { ...opciones, method: "POST", body: datos })
  },

  perfil: {
    /**
     * GET /api/perfil. Cuerpo: ninguno.
     * Respuesta: { perfil: { id, nombre_completo, correo, telefono, ciudad, pais, foto_url, rol, creado_en } }.
     * El servidor obtiene siempre el usuario desde la cookie de sesión; no acepta un usuario_id del navegador.
     */
    obtener: () => solicitar("/perfil"),

    /**
     * PUT /api/perfil.
     * Cuerpo: { nombre_completo, correo, telefono?, ciudad?, pais?, foto? }.
     * foto es opcional y tiene { nombre, tipo, contenido_base64 }; el servidor almacena el archivo y actualiza USUARIOS.foto_url.
     * Respuesta: { perfil } con los campos públicos actualizados. No debe incluir password_hash ni información de SESIONES.
     */
    actualizar: (datos) => solicitar("/perfil", { method: "PUT", body: datos }),

    /**
     * POST /api/perfil/contrasena.
     * Cuerpo: { contrasena_actual, contrasena_nueva }.
     * Respuesta: { mensaje }. El servidor verifica la contraseña actual y aplica su política de contraseña.
     */
    cambiarContrasena: (datos) => solicitar("/perfil/contrasena", { method: "POST", body: datos })
  },

  cuenta: {
    /**
     * DELETE /api/cuenta.
     * Cuerpo JSON: { correo_confirmacion }.
     * Respuesta: 204 o { mensaje }. El backend verifica el correo y elimina/desactiva de forma segura la cuenta de la sesión.
     * Las relaciones dependientes deben respetar las reglas referenciales definidas en MySQL.
     */
    eliminar: (datos) => solicitar("/cuenta", { method: "DELETE", body: datos })
  },

  preferencias: {
    /** GET /api/preferencias. Cuerpo: ninguno. Respuesta: { preferencias: campos de CONFIGURACION_USUARIO }. */
    obtener: () => solicitar("/preferencias"),

    /** PATCH /api/preferencias. Cuerpo: uno o varios campos existentes de CONFIGURACION_USUARIO. Respuesta: { preferencias }. */
    actualizar: (datos) => solicitar("/preferencias", { method: "PATCH", body: datos })
  },

  inicio: {
    /**
     * GET /api/inicio/resumen.
     * Cuerpo: ninguno.
     * Respuesta: { resumen: { mascotas_registradas, vacunas_proximas, proximas_citas, recordatorios_pendientes } }.
     * El servidor obtiene los contadores para el usuario autenticado desde la vista v_resumen_inicio.
     */
    obtenerResumen: () => solicitar("/inicio/resumen"),

    /**
     * GET /api/inicio/eventos.
     * Cuerpo: ninguno.
     * Respuesta: { datos: [{ tipo_evento, id, mascota_id, fecha_evento, hora_evento, nombre_mascota, nombre_evento, estado? }] }.
     * Cada elemento reúne una cita o una próxima dosis de vacuna de las mascotas del usuario y viene ordenado por fecha.
     * fecha_evento, hora_evento, nombre_mascota y nombre_evento son alias de presentación derivados de CITAS,
     * VACUNACIONES, MASCOTAS, MOTIVOS_CONSULTA y VACUNAS; no son columnas nuevas de las tablas.
     */
    listarEventos: () => solicitar("/inicio/eventos")
  },

  admin: {
    /** GET /api/admin/resumen. Cuerpo: ninguno. Respuesta: { resumen } calculado por el servidor para el panel administrativo. */
    obtenerResumen: () => solicitar("/admin/resumen"),

    /**
     * GET /api/admin/usuarios?q={q}&pagina={pagina}.
     * Cuerpo: ninguno. q y pagina son filtros opcionales; pagina empieza en 1.
     * Respuesta: { datos: [{ id, nombre_completo, correo, telefono, activo, creado_en, cantidad_mascotas, foto_url? }],
     *   pagina, total_paginas, total_registros }.
     * cantidad_mascotas es un conteo calculado desde MASCOTAS.usuario_id, no una columna de USUARIOS.
     * El backend limita el resultado a cuentas con rol=usuario y nunca incluye password_hash ni tokens.
     */
    listarUsuarios: (parametros = {}, opciones = {}) => solicitar(`/admin/usuarios${crearQuery(parametros)}`, opciones),

    /**
     * PATCH /api/admin/usuarios/{id}/activo.
     * Cuerpo JSON: { activo: true|false }. Respuesta: { usuario: { id, nombre_completo, activo } }.
     * El servidor solo permite modificar cuentas de rol usuario; nunca debe confiar en un ID del navegador sin autorización.
     */
    cambiarEstadoUsuario: (id, activo) => solicitar(`/admin/usuarios/${idEnRuta(id)}/activo`, { method: "PATCH", body: { activo: Boolean(activo) } }),

    /**
     * GET /api/admin/usuarios/{id}/mascotas.
     * Cuerpo: ninguno. Respuesta: { datos: [{ id, usuario_id, nombre, especie_id, nombre_especie?, raza_id,
     *   nombre_raza?, sexo, color, fecha_nacimiento, estado_salud, foto_url, activa, creado_en }] }.
     * El backend verifica que la cuenta exista y devuelve sus mascotas sin incluir datos de otros usuarios.
     */
    obtenerMascotasUsuario: (id, opciones = {}) => solicitar(`/admin/usuarios/${idEnRuta(id)}/mascotas`, opciones),

    /**
     * GET /api/admin/usuarios/{id}.
     * Cuerpo: ninguno. Respuesta: { usuario: { id, nombre_completo, correo, telefono, activo, creado_en } }.
     * Permite abrir el formulario de agendamiento con un usuario ya seleccionado desde su detalle.
     */
    obtenerUsuario: (id, opciones = {}) => solicitar(`/admin/usuarios/${idEnRuta(id)}`, opciones),

    /**
     * GET /api/admin/citas?estado=&veterinaria_id=&fecha=&usuario_id=&mes=.
     * Cuerpo: ninguno. Todos los filtros son opcionales; mes usa AAAA-MM y fecha AAAA-MM-DD.
     * Respuesta: { datos: [{ id, mascota_id, usuario_id, nombre_usuario, nombre_mascota,
     *   veterinaria_id, nombre_veterinaria, veterinario_id?, nombre_veterinario?, motivo_id,
     *   nombre_motivo, fecha_cita, hora_cita, notas, estado, creado_en, actualizado_en }] }.
     * Los nombres y usuario_id son alias de consulta derivados de las relaciones, no columnas de CITAS.
     */
    listarCitas: (parametros = {}, opciones = {}) => solicitar(`/admin/citas${crearQuery(parametros)}`, opciones),

    /**
     * GET /api/admin/disponibilidad?veterinaria_id={id}&fecha=AAAA-MM-DD&excluir_cita_id={id?}.
     * Cuerpo: ninguno. excluir_cita_id es opcional y se usa al reprogramar para no contar la propia cita como ocupada.
     * Respuesta: { datos: [{ hora_cita }] } con horas disponibles calculadas desde HORARIOS_VETERINARIA
     * y las CITAS que ocupan ese horario. El servidor debe volver a comprobar disponibilidad al crear o mover la cita.
     */
    obtenerDisponibilidad: (parametros, opciones = {}) => solicitar(`/admin/disponibilidad${crearQuery(parametros)}`, opciones),

    /**
     * POST /api/admin/citas.
     * Cuerpo: { mascota_id, veterinaria_id, motivo_id, fecha_cita, hora_cita, notas?, estado? }.
     * Respuesta: { cita }. El navegador NO envía creado_por_id; el backend lo obtiene de la sesión autenticada.
     * El servidor vuelve a validar que la mascota pertenezca al usuario y que la hora siga libre.
     */
    agendarCita: (datos) => solicitar("/admin/citas", { method: "POST", body: datos }),

    /**
     * PATCH /api/admin/citas/{id}.
     * Cuerpo: uno o varios de { estado, fecha_cita, hora_cita, veterinaria_id, motivo_id, notas }.
     * Respuesta: { cita }. El servidor vuelve a validar disponibilidad, relaciones y permisos.
     */
    actualizarCita: (id, datos) => solicitar(`/admin/citas/${idEnRuta(id)}`, { method: "PATCH", body: datos }),

    /** POST /api/admin/vacunaciones. Cuerpo: { mascota_id, vacuna_id, fecha_aplicacion, proxima_dosis?, veterinaria_id?, veterinario_id?, lote?, notas? }. Respuesta: { vacunacion }. Se conserva para compatibilidad con entregas previas. */
    registrarVacunacion: (datos) => solicitar("/admin/vacunaciones", { method: "POST", body: datos }),

    /**
     * GET /api/admin/mascotas/{id}/vacunas.
     * Cuerpo: ninguno. Respuesta: { datos: [{ id, mascota_id, vacuna_id, nombre_vacuna,
     *   fecha_aplicacion, proxima_dosis, veterinaria_id, nombre_veterinaria, veterinario_id,
     *   nombre_veterinario?, lote, notas, cita_id?, estado }] }.
     * Devuelve el carnet completo de una mascota; estado puede ser al_dia, proxima o vencida.
     * El servidor comprueba que el solicitante sea administrador.
     */
    obtenerVacunasMascota: (mascotaId, opciones = {}) => solicitar(`/admin/mascotas/${idEnRuta(mascotaId)}/vacunas`, opciones),

    /**
     * POST /api/admin/vacunas-aplicadas.
     * Cuerpo: { mascota_id, vacuna_id, fecha_aplicacion, proxima_dosis?, veterinaria_id?,
     *   veterinario_id?, nombre_veterinario?, lote?, notas?, cita_id? }.
     * Respuesta: { vacunacion }.
     * El navegador nunca envía registrado_por_id; el servidor lo obtiene de la sesión del administrador.
     * nombre_veterinario es alias de entrada para resolver o seleccionar VETERINARIOS.id según veterinaria_id.
     * cita_id es opcional y requiere persistencia/relación en el backend.
     */
    crearVacunaAplicada: (datos) => solicitar("/admin/vacunas-aplicadas", { method: "POST", body: datos }),

    /**
     * PUT /api/admin/vacunas-aplicadas/{id}.
     * Cuerpo: campos editables { mascota_id, vacuna_id, fecha_aplicacion, proxima_dosis?,
     *   veterinaria_id?, veterinario_id?, nombre_veterinario?, lote?, notas?, cita_id? }.
     * Respuesta: { vacunacion }. El servidor valida las relaciones y conserva el autor de registro original.
     */
    actualizarVacunaAplicada: (id, datos) => solicitar(`/admin/vacunas-aplicadas/${idEnRuta(id)}`, { method: "PUT", body: datos }),

    /** DELETE /api/admin/vacunas-aplicadas/{id}. Cuerpo: ninguno. Respuesta: 204 o { mensaje }. */
    eliminarVacunaAplicada: (id) => solicitar(`/admin/vacunas-aplicadas/${idEnRuta(id)}`, { method: "DELETE" }),

    /** GET /api/admin/{recurso}. Cuerpo: ninguno. Respuesta: { datos: [registros del catálogo] }. recurso permitido: especies, razas, vacunas, motivos-consulta, veterinarias, veterinarios u horarios-veterinaria. */
    listarCatalogo: (recurso, parametros = {}) => solicitar(`/admin/${validarRecursoAdmin(recurso)}${crearQuery(parametros)}`),

    /** POST /api/admin/{recurso}. Cuerpo: campos de la tabla de catálogo correspondiente. Respuesta: { registro }. */
    crearCatalogo: (recurso, datos) => solicitar(`/admin/${validarRecursoAdmin(recurso)}`, { method: "POST", body: datos }),

    /** PUT /api/admin/{recurso}/{id}. Cuerpo: representación editable del registro; admite actualización parcial según el contrato del catálogo. Respuesta: { registro }. */
    actualizarCatalogo: (recurso, id, datos) => solicitar(`/admin/${validarRecursoAdmin(recurso)}/${idEnRuta(id)}`, { method: "PUT", body: datos }),

    /** PATCH /api/admin/{recurso}/{id}/estado. Cuerpo: { activa: true|false } o { activo: true|false }, según la tabla. Respuesta: { registro }. */
    cambiarEstadoCatalogo: (recurso, id, datos) => solicitar(`/admin/${validarRecursoAdmin(recurso)}/${idEnRuta(id)}/estado`, { method: "PATCH", body: datos })
  }
};

/** Evita que una llamada administrativa construya rutas fuera de los catálogos definidos. */
function validarRecursoAdmin(recurso) {
  const permitidos = new Set([
    "especies",
    "razas",
    "vacunas",
    "motivos-consulta",
    "veterinarias",
    "veterinarios",
    "horarios-veterinaria"
  ]);
  if (!permitidos.has(recurso)) {
    throw new TypeError("El recurso administrativo no está permitido.");
  }
  return recurso;
}

export { solicitar };
export default api;
