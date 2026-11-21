/** Funciones comunes de autenticación y protección de páginas por rol. */
import { api, ApiError } from "./api.js";

let sesionEnMemoria = null;
let solicitudSesion = null;

/**
 * Obtiene la sesión vigente sin persistirla en almacenamiento del navegador.
 * @param {{forzar?: boolean}} opciones Permite solicitar una lectura nueva al servidor.
 * @returns {Promise<object>} Datos de sesión entregados por GET /api/sesion.
 */
export async function obtenerSesion({ forzar = false } = {}) {
  if (!forzar && sesionEnMemoria) return sesionEnMemoria;
  if (!forzar && solicitudSesion) return solicitudSesion;

  solicitudSesion = api.sesion.obtener()
    .then((respuesta) => {
      sesionEnMemoria = respuesta;
      return respuesta;
    })
    .catch((error) => {
      sesionEnMemoria = null;
      throw error;
    })
    .finally(() => {
      solicitudSesion = null;
    });

  return solicitudSesion;
}

/** Devuelve el rol desde la forma de sesión acordada con el servidor. */
export function obtenerRol(sesion) {
  return sesion?.usuario?.rol ?? null;
}

/**
 * Protege una página consultando siempre GET /api/sesion.
 * Si no hay sesión redirige al login; si el rol no está permitido, redirige a Inicio.
 * El control definitivo de permisos permanece en el servidor.
 * @param {{roles?: string[], loginUrl?: string, inicioUrl?: string, redirigir?: boolean}} opciones Configuración de protección.
 * @returns {Promise<object|null>} Sesión válida o null si se redirigió.
 */
export async function protegerPagina({
  roles = ["usuario", "administrador"],
  loginUrl = "/login.html",
  inicioUrl = "/inicio.html",
  redirigir = true
} = {}) {
  try {
    const sesion = await obtenerSesion({ forzar: true });
    const rol = obtenerRol(sesion);

    if (!sesion?.usuario || !["usuario", "administrador"].includes(rol)) {
      throw new ApiError({ mensaje: "La sesión no contiene un usuario válido.", status: 401 });
    }

    if (!roles.includes(rol)) {
      if (redirigir) window.location.replace(inicioUrl);
      return null;
    }

    return sesion;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      limpiarEstadoLocal();
      if (redirigir) window.location.replace(loginUrl);
      return null;
    }
    throw error;
  }
}

/**
 * Cierra la sesión en el servidor y limpia cualquier estado local relacionado con la sesión.
 * @param {{loginUrl?: string, redirigir?: boolean}} opciones Destino posterior al cierre.
 * @returns {Promise<void>} Finaliza cuando el servidor responde o falla la petición.
 */
export async function cerrarSesion({ loginUrl = "/login.html", redirigir = true } = {}) {
  try {
    await api.sesion.cerrar();
  } finally {
    limpiarEstadoLocal();
    if (redirigir) window.location.replace(loginUrl);
  }
}

/** Elimina referencias efímeras y claves de sesión heredadas; nunca se almacenan tokens. */
export function limpiarEstadoLocal() {
  sesionEnMemoria = null;
  solicitudSesion = null;
  try {
    sessionStorage.clear();
    localStorage.removeItem("user");
    localStorage.removeItem("rol");
  } catch {
    // El navegador puede bloquear el almacenamiento; la sesión en memoria también queda limpia.
  }
}
