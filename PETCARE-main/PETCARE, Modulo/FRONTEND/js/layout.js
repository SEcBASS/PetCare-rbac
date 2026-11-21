/** Renderizado reutilizable de la navegación de PetCare para usuario y administrador. */
import { api } from "./api.js";
import { cerrarSesion } from "./sesion.js";
import { debounce, iniciales, textoSeguro } from "./utils.js";

const ICONOS = {
  inicio: ["M3 10.5 12 3l9 7.5", "M5.5 9.5V21h13V9.5", "M9 21v-7h6v7"],
  mascotas: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  vacunas: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
  citas: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "M8 13h3", "M8 17h5"],
  asistente: ["M12 3a7 7 0 0 0-7 7v3a3 3 0 0 0 3 3h1v-6H8a4 4 0 0 1 8 0h-1v6h1a3 3 0 0 0 3-3v-3a7 7 0 0 0-7-7Z", "M15 20h-3a2 2 0 0 1-2-2v-1"],
  veterinarias: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-8h6v8", "M9 8h.01", "M15 8h.01"],
  configuracion: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1-3.3-1.2-.1-.2a1.7 1.7 0 0 0-1.1-1l-.2-.1-1.2-3.3.1-.2a1.7 1.7 0 0 0 .1-1.8l-.1-.2 1.2-3.3.2-.1a1.7 1.7 0 0 0 1-1.1l.1-.2 3.3-1.2.2.1a1.7 1.7 0 0 0 1.8.1l.2-.1 1.7 2.9-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2-.1 3.3-.2.1Z"],
  salir: ["M10 17l5-5-5-5", "M15 12H3", "M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"],
  campana: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  panel: ["M3 3h8v8H3z", "M13 3h8v5h-8z", "M13 10h8v11h-8z", "M3 13h8v8H3z"],
  usuarios: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M20 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"] ,
  catalogos: ["M4 5h16", "M4 12h16", "M4 19h16", "M8 5v.01", "M12 12v.01", "M16 19v.01"]
};

const MENU_USUARIO = [
  { etiqueta: "Inicio", ruta: "/inicio.html", icono: "inicio" },
  { etiqueta: "Mis mascotas", ruta: "/mascotas.html", icono: "mascotas" },
  { etiqueta: "Vacunas", ruta: "/vacunas.html", icono: "vacunas" },
  { etiqueta: "Citas", ruta: "/citas.html", icono: "citas" },
  { etiqueta: "Asistente IA", ruta: "/asistente.html", icono: "asistente" },
  { etiqueta: "Veterinarias", ruta: "/veterinarias.html", icono: "veterinarias" },
  { etiqueta: "Configuración", ruta: "/configuracion.html", icono: "configuracion" }
];

const MENU_ADMINISTRADOR = [
  { etiqueta: "Usuarios", ruta: "/admin-usuarios.html", icono: "usuarios" },
  { etiqueta: "Citas", ruta: "/admin-citas.html", icono: "citas" },
  { etiqueta: "Carnet de vacunas", ruta: "/admin-vacunas.html", icono: "vacunas" },
  { etiqueta: "Catálogos", ruta: "/admin-catalogos.html", icono: "catalogos" },
  { etiqueta: "Configuración", ruta: "/configuracion.html", icono: "configuracion" }
];

/** Crea un elemento HTML y asigna texto plano, atributos y clases sin interpretar datos dinámicos. */
function crearElemento(etiqueta, { clase, texto, atributos = {} } = {}) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) elemento.setAttribute(nombre, String(valor));
  }
  return elemento;
}

/** Dibuja un ícono SVG a partir de trazos estáticos definidos en este archivo. */
function crearIcono(nombre) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const trazo of ICONOS[nombre] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", trazo);
    svg.append(path);
  }
  return svg;
}

/** Normaliza la ruta actual para marcar correctamente la sección activa. */
function rutaActualNormalizada(ruta) {
  const pathname = new URL(ruta, window.location.origin).pathname;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/**
 * Construye la barra lateral, barra superior y contenedor de contenido de la aplicación.
 * @param {{contenedor: string|HTMLElement, sesion: object, titulo: string, paginaActual?: string, onBuscar?: Function, onCerrarSesion?: Function, contadorNotificaciones?: number}} opciones Elementos y datos mínimos de sesión.
 * @returns {{elemento: HTMLElement, contenido: HTMLElement, actualizarNotificaciones: Function, recargarNotificaciones: Function, actualizarUsuario: Function, destruir: Function}}
 */
export function montarLayout({
  contenedor = "#app",
  sesion,
  titulo,
  paginaActual = window.location.pathname,
  onBuscar,
  onCerrarSesion,
  contadorNotificaciones
} = {}) {
  const destino = typeof contenedor === "string" ? document.querySelector(contenedor) : contenedor;
  if (!(destino instanceof HTMLElement)) throw new TypeError("No se encontró el contenedor del layout.");
  if (!sesion?.usuario) throw new TypeError("Se requiere una sesión válida para dibujar el layout.");

  const usuario = sesion.usuario;
  const rol = usuario.rol;
  if (rol !== "usuario" && rol !== "administrador") throw new TypeError("El rol recibido no es válido.");

  const raiz = crearElemento("div", { clase: "app-layout" });
  const saltoContenido = crearElemento("a", {
    clase: "salto-contenido",
    texto: "Saltar al contenido",
    atributos: { href: "#contenido-principal" }
  });
  raiz.append(saltoContenido);

  const barraLateral = crearElemento("aside", {
    clase: "app-sidebar",
    atributos: { "aria-label": "Navegación principal", id: "petcare-sidebar" }
  });

  const marca = crearElemento("a", { clase: "app-sidebar__marca", atributos: { href: rol === "administrador" ? "/admin-usuarios.html" : "/inicio.html" } });
  const marcaIcono = crearElemento("span", { clase: "app-sidebar__marca-icono" });
  marcaIcono.append(crearIcono("mascotas"));
  marca.append(marcaIcono, crearElemento("span", { texto: "PetCare" }));
  barraLateral.append(marca);

  const navegacion = crearElemento("nav", { atributos: { "aria-label": "Secciones" } });
  const lista = crearElemento("ul", { clase: "app-sidebar__nav" });
  const enlaces = rol === "administrador" ? MENU_ADMINISTRADOR : MENU_USUARIO;

  for (const item of enlaces) {
    const fila = crearElemento("li");
    const enlace = crearElemento("a", {
      clase: "app-sidebar__enlace",
      atributos: { href: item.ruta }
    });
    enlace.append(crearIcono(item.icono), crearElemento("span", { texto: item.etiqueta }));
    if (rutaActualNormalizada(item.ruta) === rutaActualNormalizada(paginaActual)) {
      enlace.setAttribute("aria-current", "page");
    }
    enlace.addEventListener("click", () => cerrarMenuMovil());
    fila.append(enlace);
    lista.append(fila);
  }
  navegacion.append(lista);
  barraLateral.append(navegacion);

  const pieLateral = crearElemento("div", { clase: "app-sidebar__pie" });
  const botonSalir = crearElemento("button", {
    clase: "app-sidebar__enlace app-sidebar__cerrar",
    texto: "Cerrar sesión",
    atributos: { type: "button" }
  });
  botonSalir.prepend(crearIcono("salir"));
  botonSalir.addEventListener("click", async () => {
    botonSalir.disabled = true;
    try {
      if (typeof onCerrarSesion === "function") {
        await onCerrarSesion();
      } else {
        await cerrarSesion();
      }
    } catch {
      botonSalir.disabled = false;
    }
  });
  pieLateral.append(botonSalir);
  barraLateral.append(pieLateral);

  const principal = crearElemento("div", { clase: "app-main" });
  const barraSuperior = crearElemento("header", { clase: "app-topbar" });
  const botonMenu = crearElemento("button", {
    clase: "app-topbar__menu",
    atributos: { type: "button", "aria-label": "Abrir menú", "aria-controls": "petcare-sidebar", "aria-expanded": "false" }
  });
  botonMenu.append(crearIcono("menu"));
  botonMenu.addEventListener("click", () => {
    const abierto = barraLateral.classList.toggle("is-open");
    botonMenu.setAttribute("aria-expanded", String(abierto));
    botonMenu.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  });

  const tituloPagina = crearElemento("h1", { clase: "app-topbar__titulo", texto: titulo || "PetCare" });
  const formularioBusqueda = crearElemento("form", {
    clase: "app-topbar__busqueda",
    atributos: { role: "search", "aria-label": "Buscar en PetCare" }
  });
  const campoBusqueda = crearElemento("input", {
    atributos: {
      type: "search",
      name: "buscar",
      placeholder: "Buscar...",
      "aria-label": "Buscar en esta sección"
    }
  });
  formularioBusqueda.addEventListener("submit", (evento) => evento.preventDefault());
  const emitirBusqueda = debounce((valor) => {
    if (typeof onBuscar === "function") onBuscar(valor);
    raiz.dispatchEvent(new CustomEvent("petcare:buscar", { bubbles: true, detail: { termino: valor } }));
  }, 250);
  campoBusqueda.addEventListener("input", () => emitirBusqueda(campoBusqueda.value.trim()));
  formularioBusqueda.append(campoBusqueda);

  const acciones = crearElemento("div", { clase: "app-topbar__acciones" });
  const enlaceNotificaciones = crearElemento("a", {
    clase: "app-topbar__notificaciones",
    atributos: { href: "/notificaciones.html", "aria-label": "Notificaciones" }
  });
  enlaceNotificaciones.append(crearIcono("campana"));
  const contador = crearElemento("span", { clase: "app-topbar__contador", atributos: { "aria-live": "polite" } });
  enlaceNotificaciones.append(contador);

  const bloqueUsuario = crearElemento("div", { clase: "app-topbar__usuario" });
  const avatar = crearElemento("span", { clase: "app-topbar__avatar", atributos: { "aria-hidden": "true" } });
  const nombreUsuario = crearElemento("span", { texto: usuario.nombre_completo || "Usuario" });
  bloqueUsuario.append(avatar, nombreUsuario);
  acciones.append(enlaceNotificaciones, bloqueUsuario);

  barraSuperior.append(botonMenu, tituloPagina, formularioBusqueda, acciones);
  const contenido = crearElemento("main", {
    clase: "app-contenido",
    atributos: { id: "contenido-principal", tabindex: "-1" }
  });
  principal.append(barraSuperior, contenido);
  raiz.append(barraLateral, principal);
  destino.replaceChildren(raiz);

  /** Cierra la navegación móvil y devuelve el foco al control que la abrió. */
  function cerrarMenuMovil() {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    barraLateral.classList.remove("is-open");
    botonMenu.setAttribute("aria-expanded", "false");
    botonMenu.setAttribute("aria-label", "Abrir menú");
  }

  /** Actualiza el contador visible sin recrear el resto del layout. */
  function actualizarNotificaciones(cantidad) {
    const numero = Number.isFinite(Number(cantidad)) ? Math.max(0, Number(cantidad)) : 0;
    contador.textContent = numero > 99 ? "99+" : String(numero);
    contador.hidden = numero === 0;
    enlaceNotificaciones.setAttribute("aria-label", numero === 1 ? "Notificaciones, 1 sin leer" : `Notificaciones, ${numero} sin leer`);
  }

  /** Actualiza avatar y nombre con nodos de texto; no interpreta HTML recibido del servidor. */
  function actualizarUsuario(datosUsuario = {}) {
    const nombre = textoSeguro(datosUsuario.nombre_completo || "Usuario");
    nombreUsuario.textContent = nombre;
    avatar.replaceChildren();
    const rutaFoto = obtenerUrlFotoSegura(datosUsuario.foto_url);
    if (rutaFoto) {
      const imagen = crearElemento("img", { atributos: { src: rutaFoto, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
      imagen.addEventListener("error", () => avatar.replaceChildren(document.createTextNode(iniciales(nombre))));
      avatar.append(imagen);
    } else {
      avatar.textContent = iniciales(nombre);
    }
  }

  /** Acepta solo URL HTTPS o rutas del mismo origen para evitar esquemas activos. */
  function obtenerUrlFotoSegura(valor) {
    if (!valor || typeof valor !== "string") return null;
    try {
      const url = new URL(valor, window.location.origin);
      if (url.protocol !== "https:" && url.origin !== window.location.origin) return null;
      if (url.protocol !== "https:" && url.protocol !== window.location.protocol) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  actualizarUsuario(usuario);
  actualizarNotificaciones(contadorNotificaciones ?? sesion.notificaciones_sin_leer ?? 0);

  /** Consulta el contador usando el endpoint existente y conserva el dato de sesión si falla la red. */
  async function recargarNotificaciones() {
    try {
      const respuesta = await api.notificaciones.contarSinLeer();
      const cantidad = respuesta?.sin_leer ?? 0;
      actualizarNotificaciones(cantidad);
      return cantidad;
    } catch {
      const cantidad = sesion.notificaciones_sin_leer ?? 0;
      actualizarNotificaciones(cantidad);
      return cantidad;
    }
  }

  if (contadorNotificaciones === undefined) void recargarNotificaciones();

  return {
    elemento: raiz,
    contenido,
    actualizarNotificaciones,
    recargarNotificaciones,
    actualizarUsuario,
    destruir: () => destino.replaceChildren()
  };
}
