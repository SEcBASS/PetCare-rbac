/**
 * Módulo de bandeja de notificaciones para las cuentas de PetCare.
 * Consulta exclusivamente la API y mantiene las lecturas sincronizadas con el layout.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { textoSeguro } from "./utils.js";

const estado = {
  sesion: null,
  layout: null,
  notificaciones: [],
  filtro: "todas",
  cargando: false,
  datosCargados: false,
  marcandoTodas: false,
  notificacionEnProceso: null,
  error: null,
  secuencia: 0,
  regiones: null
};

const PRESENTACIONES = {
  cita_confirmada: {
    etiqueta: "Cita confirmada",
    clase: "notificacion--cita-confirmada",
    icono: "calendario"
  },
  cita_completada: {
    etiqueta: "Cita completada",
    clase: "notificacion--cita-completada",
    icono: "calendario-check"
  },
  recordatorio: {
    etiqueta: "Recordatorio",
    clase: "notificacion--recordatorio",
    icono: "campana"
  },
  vacuna_proxima: {
    etiqueta: "Vacuna próxima",
    clase: "notificacion--vacuna-proxima",
    icono: "vacuna"
  },
  vacuna_vencida: {
    etiqueta: "Vacuna vencida",
    clase: "notificacion--vacuna-vencida",
    icono: "vacuna-alerta"
  },
  novedad: {
    etiqueta: "Novedad",
    clase: "notificacion--novedad",
    icono: "novedad"
  },
  cita: {
    etiqueta: "Cita",
    clase: "notificacion--cita-confirmada",
    icono: "calendario"
  },
  vacuna: {
    etiqueta: "Vacuna",
    clase: "notificacion--vacuna-proxima",
    icono: "vacuna"
  },
  sistema: {
    etiqueta: "Novedad",
    clase: "notificacion--novedad",
    icono: "novedad"
  }
};

const ICONOS = {
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
  "calendario-check": ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "m8.5 15 2 2 5-5"],
  campana: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  vacuna: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
  "vacuna-alerta": ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "M12 8v5", "M12 16.5v.01"],
  novedad: ["m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z", "m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z"]
};

/** Crea nodos HTML y establece el texto con textContent. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Construye un ícono vectorial usando únicamente trazos estáticos del módulo. */
function crearIcono(nombre) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
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

/** Extrae la colección devuelta por el contrato REST sin crear registros locales. */
function extraerColeccion(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

/** Reconoce valores booleanos y los indicadores numéricos de MySQL. */
function estaLeida(valor) {
  return valor === true || valor === 1 || valor === "1";
}

/** Convierte DATETIME de MySQL a fecha local sin desplazar su hora por zona UTC. */
function obtenerFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const texto = String(valor).trim();
  const mysql = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (mysql) {
    const [, anio, mes, dia, hora, minuto, segundo = "0"] = mysql;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Presenta el tiempo transcurrido de una notificación en español. */
function tiempoRelativo(valor) {
  const fecha = obtenerFecha(valor);
  if (!fecha) return "Fecha no disponible";
  const diferenciaSegundos = (fecha.getTime() - Date.now()) / 1000;
  if (Math.abs(diferenciaSegundos) < 45) return "Ahora mismo";

  const unidades = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"]
  ];
  const formato = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });
  for (const [segundos, unidad] of unidades) {
    if (Math.abs(diferenciaSegundos) >= segundos) {
      const relativo = formato.format(Math.round(diferenciaSegundos / segundos), unidad);
      return relativo.replace(/^./, (caracter) => caracter.toLocaleUpperCase("es-CO"));
    }
  }
  return "Ahora mismo";
}

/** Ordena notificaciones de la más reciente a la más antigua. */
function ordenarPorFecha(registros) {
  return [...registros].sort((a, b) => {
    const fechaA = obtenerFecha(a?.creado_en)?.getTime() ?? 0;
    const fechaB = obtenerFecha(b?.creado_en)?.getTime() ?? 0;
    return fechaB - fechaA;
  });
}

/** Devuelve la presentación segura para el tipo recibido desde el backend. */
function obtenerPresentacion(tipo) {
  return PRESENTACIONES[textoSeguro(tipo).toLowerCase()] || PRESENTACIONES.novedad;
}

/** Determina el destino relacionado, usando solo identificadores presentes en NOTIFICACIONES. */
function obtenerDestino(notificacion) {
  if (notificacion?.cita_id !== null && notificacion?.cita_id !== undefined && notificacion.cita_id !== "") {
    return `/citas.html?cita_id=${encodeURIComponent(String(notificacion.cita_id))}`;
  }
  if (notificacion?.vacunacion_id !== null && notificacion?.vacunacion_id !== undefined && notificacion.vacunacion_id !== "") {
    return `/vacunas.html?vacunacion_id=${encodeURIComponent(String(notificacion.vacunacion_id))}`;
  }
  if (notificacion?.mascota_id !== null && notificacion?.mascota_id !== undefined && notificacion.mascota_id !== "") {
    return `/mascota.html?id=${encodeURIComponent(String(notificacion.mascota_id))}`;
  }
  return null;
}

/** Actualiza los controles de filtro con estado accesible. */
function actualizarFiltros() {
  for (const boton of estado.regiones.filtros.querySelectorAll("[data-filtro]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.filtro === estado.filtro));
  }
}

/** Crea una tarjeta completa y su acción de marcar como leída/navegar. */
function crearTarjeta(notificacion) {
  const leida = estaLeida(notificacion.leida);
  const presentacion = obtenerPresentacion(notificacion.tipo);
  const tarjeta = crearElemento("article", {
    clase: `notificacion ${presentacion.clase}${leida ? "" : " notificacion--no-leida"}`
  });
  const boton = crearElemento("button", {
    clase: "notificacion__boton",
    atributos: {
      type: "button",
      "aria-label": `${textoSeguro(notificacion.titulo) || presentacion.etiqueta}. ${leida ? "Leída" : "No leída"}. Abrir notificación.`
    }
  });

  const icono = crearElemento("span", { clase: "notificacion__icono" });
  icono.append(crearIcono(presentacion.icono));

  const contenido = crearElemento("span", { clase: "notificacion__contenido" });
  const lineaTitulo = crearElemento("span", { clase: "notificacion__titulo-linea" });
  lineaTitulo.append(
    crearElemento("span", { clase: "notificacion__titulo", texto: notificacion.titulo || presentacion.etiqueta }),
    crearElemento("span", { clase: "notificacion__tipo", texto: presentacion.etiqueta })
  );
  contenido.append(
    lineaTitulo,
    crearElemento("span", { clase: "notificacion__mensaje", texto: notificacion.mensaje || "Sin detalles adicionales." })
  );

  const tiempo = crearElemento("time", {
    clase: "notificacion__tiempo",
    texto: tiempoRelativo(notificacion.creado_en)
  });
  const fecha = obtenerFecha(notificacion.creado_en);
  if (fecha) tiempo.dateTime = fecha.toISOString();

  boton.append(icono, contenido, tiempo);
  if (!leida) {
    boton.append(crearElemento("span", {
      clase: "notificacion__punto",
      atributos: { "aria-label": "No leída" }
    }));
  }
  boton.addEventListener("click", () => abrirNotificacion(notificacion));
  tarjeta.append(boton);
  return tarjeta;
}

/** Muestra un estado vacío distinto según el filtro activo. */
function crearEstadoVacio() {
  const vacio = crearElemento("section", { clase: "notificaciones-estado" });
  const icono = crearElemento("span", { clase: "notificaciones-estado__icono" });
  icono.append(crearIcono("campana"));
  const sinLeer = estado.filtro === "sin_leer";
  vacio.append(
    icono,
    crearElemento("h3", { texto: sinLeer ? "Estás al día" : "Todavía no tienes notificaciones" }),
    crearElemento("p", {
      texto: sinLeer
        ? "No tienes notificaciones pendientes por leer. Aquí aparecerán cuando haya novedades sobre tus mascotas."
        : "Cuando PetCare tenga novedades sobre tus citas, vacunas o recordatorios, aparecerán aquí."
    })
  );
  return vacio;
}

/** Construye el estado de error con una acción de reintento. */
function crearEstadoError() {
  const bloque = crearElemento("section", { clase: "notificaciones-estado", atributos: { role: "alert" } });
  const icono = crearElemento("span", { clase: "notificaciones-estado__icono" });
  icono.append(crearIcono("novedad"));
  bloque.append(
    icono,
    crearElemento("h3", { texto: "No pudimos cargar tus notificaciones" }),
    crearElemento("p", { texto: estado.error instanceof ApiError ? estado.error.error : "Comprueba tu conexión e inténtalo nuevamente." })
  );
  const reintentar = crearElemento("button", {
    clase: "boton boton--secundario",
    texto: "Reintentar",
    atributos: { type: "button" }
  });
  reintentar.addEventListener("click", cargarNotificaciones);
  bloque.append(reintentar);
  return bloque;
}

/** Renderiza lista, estados y contador sin interpretar datos como HTML. */
function renderizarLista() {
  if (!estado.regiones) return;
  const contenedor = estado.regiones.contenido;
  contenedor.setAttribute("aria-busy", String(estado.cargando));
  contenedor.replaceChildren();

  if (estado.cargando) {
    const carga = crearElemento("div", { clase: "notificaciones-estado", atributos: { role: "status" } });
    carga.append(
      crearElemento("span", { clase: "notificaciones-estado__icono", texto: "…", atributos: { "aria-hidden": "true" } }),
      crearElemento("h3", { texto: "Cargando notificaciones" }),
      crearElemento("p", { texto: "Estamos consultando las novedades de tu cuenta." })
    );
    contenedor.append(carga);
    return;
  }

  if (estado.error) {
    contenedor.append(crearEstadoError());
    return;
  }

  const registros = estado.filtro === "sin_leer"
    ? estado.notificaciones.filter((notificacion) => !estaLeida(notificacion.leida))
    : estado.notificaciones;

  if (!registros.length) {
    contenedor.append(crearEstadoVacio());
    return;
  }

  const lista = crearElemento("div", { clase: "notificaciones-lista", atributos: { "aria-label": "Lista de notificaciones" } });
  const fragmento = document.createDocumentFragment();
  for (const notificacion of registros) fragmento.append(crearTarjeta(notificacion));
  lista.append(fragmento);
  contenedor.append(lista);
}

/** Actualiza el resumen visible y el número que muestra la campana compartida. */
function actualizarResumen() {
  const pendientes = estado.notificaciones.filter((notificacion) => !estaLeida(notificacion.leida)).length;
  estado.regiones.total.textContent = !estado.datosCargados
    ? "Consultando"
    : (estado.error ? "No disponible" : (pendientes === 1 ? "1 sin leer" : `${pendientes} sin leer`));
  estado.regiones.botonMarcarTodas.disabled = pendientes === 0 || estado.marcandoTodas || estado.cargando || Boolean(estado.error);
  if (estado.datosCargados && !estado.error) estado.layout?.actualizarNotificaciones(pendientes);
}

/** Cambia el filtro y vuelve a consultar los registros con el parámetro correspondiente. */
function cambiarFiltro(filtro) {
  if (estado.filtro === filtro) return;
  estado.filtro = filtro;
  actualizarFiltros();
  cargarNotificaciones();
}

/** Consulta GET /api/notificaciones y descarta respuestas de consultas anteriores. */
async function cargarNotificaciones() {
  const secuencia = ++estado.secuencia;
  estado.cargando = true;
  estado.error = null;
  renderizarLista();
  actualizarResumen();

  try {
    const parametros = estado.filtro === "sin_leer" ? { leidas: false } : {};
    const respuesta = await api.notificaciones.listar(parametros);
    if (secuencia !== estado.secuencia) return;
    estado.notificaciones = ordenarPorFecha(extraerColeccion(respuesta));
  } catch (error) {
    if (secuencia !== estado.secuencia) return;
    estado.error = error;
  } finally {
    if (secuencia === estado.secuencia) {
      estado.cargando = false;
      estado.datosCargados = true;
      renderizarLista();
      actualizarResumen();
    }
  }
}

/** Marca una notificación como leída y navega solo cuando existe una relación válida. */
async function abrirNotificacion(notificacion) {
  const id = notificacion?.id;
  if (id === undefined || id === null || id === "" || estado.notificacionEnProceso !== null) return;
  const destino = obtenerDestino(notificacion);
  const yaLeida = estaLeida(notificacion.leida);
  estado.notificacionEnProceso = String(id);
  estado.regiones.contenido.querySelectorAll("button.notificacion__boton").forEach((boton) => {
    boton.disabled = true;
  });

  try {
    if (!yaLeida) {
      await api.notificaciones.marcarLeida(id);
      estado.notificaciones = estado.notificaciones.map((registro) => (
        String(registro.id) === String(id) ? { ...registro, leida: 1 } : registro
      ));
    }
    estado.notificacionEnProceso = null;
    actualizarResumen();
    estado.layout?.recargarNotificaciones();
    if (destino) {
      window.location.assign(destino);
      return;
    }
    renderizarLista();
  } catch (error) {
    estado.notificacionEnProceso = null;
    const aviso = crearElemento("p", {
      clase: "notificaciones-aviso-accion",
      texto: error instanceof ApiError ? error.error : "No pudimos actualizar esta notificación. Inténtalo nuevamente.",
      atributos: { role: "alert" }
    });
    estado.regiones.contenido.prepend(aviso);
    estado.regiones.contenido.querySelectorAll("button.notificacion__boton").forEach((boton) => {
      boton.disabled = false;
    });
  }
}

/** Ejecuta PATCH /api/notificaciones/leer-todas y sincroniza lista y campana. */
async function marcarTodasLeidas() {
  const pendientes = estado.notificaciones.some((notificacion) => !estaLeida(notificacion.leida));
  if (!pendientes || estado.marcandoTodas) return;
  estado.marcandoTodas = true;
  estado.regiones.botonMarcarTodas.disabled = true;

  try {
    await api.notificaciones.marcarTodasLeidas();
    estado.notificaciones = estado.notificaciones.map((notificacion) => ({ ...notificacion, leida: 1 }));
    actualizarResumen();
    estado.layout?.recargarNotificaciones();
    renderizarLista();
  } catch (error) {
    const aviso = crearElemento("p", {
      clase: "notificaciones-aviso-accion",
      texto: error instanceof ApiError ? error.error : "No pudimos marcar todas como leídas. Inténtalo nuevamente.",
      atributos: { role: "alert" }
    });
    estado.regiones.panel.prepend(aviso);
  } finally {
    estado.marcandoTodas = false;
    actualizarResumen();
  }
}

/** Construye el contenido propio de la página dentro del layout compartido. */
function construirPagina(contenedor) {
  const pagina = crearElemento("section", { clase: "notificaciones-pagina", atributos: { "aria-labelledby": "notificaciones-titulo" } });
  const intro = crearElemento("header", { clase: "notificaciones-intro" });
  const textoIntro = crearElemento("div", { clase: "notificaciones-intro__texto" });
  textoIntro.append(
    crearElemento("p", { clase: "notificaciones-intro__sobrelinea", texto: "Tu espacio PetCare" }),
    crearElemento("h2", { texto: "Notificaciones", atributos: { id: "notificaciones-titulo" } }),
    crearElemento("p", { texto: "Mantente al tanto de las novedades y cuidados de tus mascotas." })
  );

  const acciones = crearElemento("div", { clase: "notificaciones-intro__acciones" });
  const total = crearElemento("span", { clase: "notificaciones-total" });
  total.append(
    crearElemento("span", { clase: "notificaciones-total__punto", atributos: { "aria-hidden": "true" } }),
    crearElemento("span", { texto: "Consultando" })
  );
  const totalTexto = total.lastElementChild;
  acciones.append(total);
  intro.append(textoIntro, acciones);

  const controles = crearElemento("section", { clase: "notificaciones-controles", atributos: { "aria-label": "Filtros de notificaciones" } });
  const filtros = crearElemento("div", { clase: "notificaciones-filtros", role: "group", atributos: { "aria-label": "Filtrar notificaciones" } });
  const botonTodas = crearElemento("button", {
    clase: "notificaciones-filtro",
    texto: "Todas",
    atributos: { type: "button", "data-filtro": "todas", "aria-pressed": "true" }
  });
  const botonSinLeer = crearElemento("button", {
    clase: "notificaciones-filtro",
    texto: "Sin leer",
    atributos: { type: "button", "data-filtro": "sin_leer", "aria-pressed": "false" }
  });
  botonTodas.addEventListener("click", () => cambiarFiltro("todas"));
  botonSinLeer.addEventListener("click", () => cambiarFiltro("sin_leer"));
  filtros.append(botonTodas, botonSinLeer);

  const botonMarcarTodas = crearElemento("button", {
    clase: "notificaciones-marcar-todas",
    texto: "Marcar todas como leídas",
    atributos: { type: "button" }
  });
  botonMarcarTodas.addEventListener("click", marcarTodasLeidas);
  controles.append(filtros, botonMarcarTodas);

  const panel = crearElemento("section", { clase: "notificaciones-panel", atributos: { "aria-label": "Actividad reciente" } });
  const encabezado = crearElemento("header", { clase: "notificaciones-panel__encabezado" });
  encabezado.append(
    crearElemento("h3", { texto: "Actividad reciente" }),
    crearElemento("span", { clase: "notificaciones-panel__ayuda", texto: "Ordenadas de la más reciente a la más antigua" })
  );
  const contenido = crearElemento("div", { clase: "notificaciones-panel__contenido", atributos: { "aria-live": "polite", "aria-busy": "true" } });
  panel.append(encabezado, contenido);
  pagina.append(intro, controles, panel);
  contenedor.replaceChildren(pagina);

  estado.regiones = { pagina, total: totalTexto, filtros, botonMarcarTodas, panel, contenido };
  actualizarResumen();
  renderizarLista();
}

/** Valida la sesión, monta el layout y carga la bandeja inicial. */
async function iniciarModulo() {
  const app = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["usuario", "administrador"] });
    if (!estado.sesion) return;

    estado.layout = montarLayout({
      contenedor: app,
      sesion: estado.sesion,
      titulo: "Notificaciones",
      paginaActual: "/notificaciones.html"
    });
    construirPagina(estado.layout.contenido);
    await cargarNotificaciones();
  } catch (error) {
    app.setAttribute("aria-busy", "false");
    const aviso = crearElemento("section", { clase: "notificaciones-estado", atributos: { role: "alert" } });
    aviso.append(
      crearElemento("h1", { texto: "No pudimos abrir tus notificaciones" }),
      crearElemento("p", { texto: error instanceof ApiError ? error.error : "Ocurrió un problema al validar tu sesión. Inténtalo nuevamente." })
    );
    const boton = crearElemento("a", { clase: "boton", texto: "Volver a iniciar sesión", atributos: { href: "/login.html" } });
    aviso.append(boton);
    app.replaceChildren(aviso);
  } finally {
    app.setAttribute("aria-busy", "false");
  }
}

iniciarModulo();
