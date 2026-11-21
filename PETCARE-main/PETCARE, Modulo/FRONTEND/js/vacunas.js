/**
 * Módulo Vacunas para el rol usuario.
 * Consulta el carnet digital en modo de solo lectura; el administrador registra las aplicaciones.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { formatearFecha, textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  admin: "/admin-usuarios.html"
};

const ICONOS = {
  vacuna: ["M7 3h10", "M7 3v4l-2 2v9a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9l-2-2V3", "M5 10h14", "M9 14h6", "M12 12v5"],
  check: ["M5 12.5 9.5 17 19 7"],
  reloj: ["M12 8v4l2.5 1.5", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  pendiente: ["M12 8v4", "M12 16h.01", "M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"],
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "M8 13h3", "M8 17h5"],
  mascota: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"]
};

const FILTROS = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "al_dia", etiqueta: "Al día" },
  { valor: "proxima", etiqueta: "Próximas" },
  { valor: "pendiente", etiqueta: "Pendientes" }
];

const estado = {
  sesion: null,
  mascotas: [],
  vacunas: [],
  filtroEstado: "todas",
  mascotaId: "",
  busqueda: "",
  expandidaId: null,
  regiones: null,
  cargando: false,
  secuencia: 0,
  errorMascotas: false,
  errorVacunas: false,
  ultimoError: null
};

/** Crea nodos y coloca los datos variables mediante textContent y atributos explícitos. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Construye iconos vectoriales con trazos estáticos del propio módulo. */
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

/** Extrae colecciones JSON sin asumir una única envoltura de respuesta. */
function obtenerColeccion(respuesta, claves = ["datos", "vacunas", "vacunaciones", "mascotas"]) {
  if (Array.isArray(respuesta)) return respuesta;
  for (const clave of claves) {
    if (Array.isArray(respuesta?.[clave])) return respuesta[clave];
  }
  return [];
}

/** Normaliza enums y etiquetas a claves comparables sin acentos. */
function normalizarClave(valor) {
  return textoSeguro(valor)
    .trim()
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

/** Traduce estados de la vista SQL a las tres categorías de la interfaz. */
function obtenerCategoria(vacuna) {
  const clave = normalizarClave(vacuna?.estado || vacuna?.estado_vacunacion);
  if (["al_dia", "aldia", "vigente"].includes(clave)) return "al_dia";
  if (["proxima", "proximo", "por_vencer", "proxima_dosis"].includes(clave)) return "proxima";
  if (["vencida", "vencido", "pendiente", "pendientes", "atrasada", "atrasado"].includes(clave)) return "pendiente";
  return "desconocido";
}

/** Obtiene nombre de mascota desde alias del endpoint o relación del registro. */
function obtenerNombreMascota(vacuna) {
  const mascota = estado.mascotas.find((item) => String(item.id) === String(vacuna?.mascota_id));
  return vacuna?.nombre_mascota || vacuna?.mascota_nombre || vacuna?.mascota?.nombre || mascota?.nombre || "Mascota";
}

/** Obtiene el nombre del tipo de vacuna desde alias o relación. */
function obtenerNombreVacuna(vacuna) {
  return vacuna?.nombre_vacuna || vacuna?.vacuna_nombre || vacuna?.vacuna?.nombre || vacuna?.nombre || "Vacuna sin nombre";
}

/** Devuelve estado y presentación visual, sin convertir estados desconocidos en información falsa. */
function obtenerPresentacionEstado(vacuna) {
  const categoria = obtenerCategoria(vacuna);
  const presentaciones = {
    al_dia: { etiqueta: "Al día", clase: "pastilla--al-dia" },
    proxima: { etiqueta: "Próxima", clase: "pastilla--proxima" },
    pendiente: { etiqueta: "Pendiente", clase: "pastilla--pendiente" },
    desconocido: { etiqueta: "No disponible", clase: "vacunas-estado-desconocido" }
  };
  return { categoria, ...presentaciones[categoria] };
}

/** Interpreta una fecha DATE de MySQL como fecha local para evitar desfases UTC. */
function analizarFechaLocal(valor) {
  if (!valor) return null;
  const coincidencia = String(valor).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (coincidencia) {
    const [, anio, mes, dia] = coincidencia;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Calcula días naturales entre hoy y la próxima dosis sin ajustar ni inventar la fecha. */
function calcularDiasHasta(valor) {
  const fecha = analizarFechaLocal(valor);
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fecha.setHours(0, 0, 0, 0);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

/** Obtiene los días indicados por la vista o calcula la diferencia desde proxima_dosis. */
function obtenerDiasParaProxima(vacuna) {
  const dias = vacuna?.dias_para_proxima;
  if (dias !== undefined && dias !== null && dias !== "" && Number.isFinite(Number(dias))) return Number(dias);
  return calcularDiasHasta(vacuna?.proxima_dosis);
}

/** Convierte días restantes en un texto breve y natural. */
function textoDias(dias) {
  if (dias === null) return "Fecha de próxima dosis no disponible";
  if (dias < 0) return `Venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

/** Comprueba si una fila coincide con el texto introducido en el buscador global. */
function coincideBusqueda(vacuna) {
  const termino = estado.busqueda.trim().toLocaleLowerCase("es-CO");
  if (!termino) return true;
  const datos = [
    obtenerNombreMascota(vacuna),
    obtenerNombreVacuna(vacuna),
    vacuna?.nombre_veterinaria,
    vacuna?.nombre_veterinario,
    vacuna?.lote,
    vacuna?.estado,
    vacuna?.fecha_aplicacion,
    vacuna?.proxima_dosis
  ];
  return datos.some((dato) => textoSeguro(dato).toLocaleLowerCase("es-CO").includes(termino));
}

/** Devuelve solo las vacunas que cumplen el filtro de estado, mascota y búsqueda. */
function obtenerVacunasFiltradas() {
  return estado.vacunas.filter((vacuna) => {
    const coincideMascota = !estado.mascotaId || String(vacuna?.mascota_id) === String(estado.mascotaId);
    const coincideEstado = estado.filtroEstado === "todas" || obtenerCategoria(vacuna) === estado.filtroEstado;
    return coincideMascota && coincideEstado && coincideBusqueda(vacuna);
  });
}

/** Muestra un estado de carga en una región concreta. */
function renderizarCarga(contenedor, mensaje) {
  const bloque = crearElemento("div", { clase: "vacunas-carga", atributos: { role: "status" } });
  bloque.append(crearElemento("span", { clase: "cargando", atributos: { "aria-hidden": "true" } }));
  bloque.append(crearElemento("p", { texto: mensaje }));
  contenedor.replaceChildren(bloque);
}

/** Muestra un error y permite volver a consultar sin recargar toda la página. */
function renderizarError(contenedor, error) {
  const bloque = crearElemento("div", { clase: "vacunas-error", atributos: { role: "alert" } });
  const mensaje = error instanceof ApiError
    ? error.error || error.message
    : error?.message || "No pudimos consultar el carnet de vacunación.";
  bloque.append(crearElemento("p", { texto: mensaje }));
  const acciones = crearElemento("div", { clase: "vacunas-error__acciones" });
  const reintentar = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", cargarVacunas);
  acciones.append(reintentar);
  bloque.append(acciones);
  contenedor.replaceChildren(bloque);
}

/** Muestra el estado vacío general o el mensaje cuando no coincide un filtro. */
function renderizarVacio(contenedor, { filtrado = false, sinMascotas = false } = {}) {
  const bloque = crearElemento("section", { clase: "vacunas-vacio", atributos: { "aria-live": "polite" } });
  const icono = crearElemento("span", { clase: "vacunas-vacio__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("vacuna"));
  const titulo = filtrado ? "No hay resultados para este filtro" : sinMascotas ? "Aún no tienes mascotas" : "Tu carnet todavía está vacío";
  let descripcion;
  if (filtrado) {
    descripcion = "Prueba con otro filtro para consultar las vacunas de tus mascotas.";
  } else if (sinMascotas) {
    descripcion = "Cuando registres una mascota, el administrador podrá registrar sus vacunas y aparecerán aquí.";
  } else {
    descripcion = "Cuando el administrador registre vacunas para tus mascotas, aparecerán aquí.";
  }
  bloque.append(icono, crearElemento("h4", { texto: titulo }), crearElemento("p", { texto: descripcion }));
  if (filtrado) {
    const limpiar = crearElemento("button", { clase: "boton boton--secundario", texto: "Ver todas", atributos: { type: "button" } });
    limpiar.addEventListener("click", () => cambiarFiltro("todas"));
    bloque.append(limpiar);
  }
  contenedor.replaceChildren(bloque);
}

/** Construye una tarjeta contadora con el total real de la colección recibida. */
function crearContador({ clase, icono, etiqueta, valor }) {
  const tarjeta = crearElemento("article", { clase: `vacunas-contador vacunas-contador--${clase}` });
  const iconoContenedor = crearElemento("span", { clase: "vacunas-contador__icono" });
  iconoContenedor.append(crearIcono(icono));
  const texto = crearElemento("div", { clase: "vacunas-contador__texto" });
  texto.append(
    crearElemento("span", { clase: "vacunas-contador__valor", texto: String(valor), atributos: { "aria-label": `${valor} vacunas` } }),
    crearElemento("span", { clase: "vacunas-contador__etiqueta", texto: etiqueta })
  );
  tarjeta.append(iconoContenedor, texto);
  return tarjeta;
}

/** Actualiza los tres contadores usando todos los resultados del filtro de mascota. */
function renderizarContadores() {
  const conteo = { al_dia: 0, proxima: 0, pendiente: 0 };
  for (const vacuna of estado.vacunas) {
    const categoria = obtenerCategoria(vacuna);
    if (Object.prototype.hasOwnProperty.call(conteo, categoria)) conteo[categoria] += 1;
  }
  const valores = estado.cargando || estado.errorVacunas
    ? { al_dia: "—", proxima: "—", pendiente: "—" }
    : conteo;
  estado.regiones.contadores.replaceChildren(
    crearContador({ clase: "aldia", icono: "check", etiqueta: "Al día", valor: valores.al_dia }),
    crearContador({ clase: "proximas", icono: "reloj", etiqueta: "Próximas", valor: valores.proxima }),
    crearContador({ clase: "pendientes", icono: "pendiente", etiqueta: "Pendientes", valor: valores.pendiente })
  );
}

/** Renderiza la alerta amarilla con dosis próximas y días restantes. */
function renderizarAlerta() {
  const alerta = estado.regiones.alerta;
  const proximas = estado.vacunas
    .filter((vacuna) => obtenerCategoria(vacuna) === "proxima" && vacuna?.proxima_dosis)
    .map((vacuna) => ({ vacuna, dias: obtenerDiasParaProxima(vacuna) }))
    .filter((item) => item.dias !== null && item.dias >= 0)
    .sort((a, b) => a.dias - b.dias);

  const encabezado = crearElemento("div", { clase: "vacunas-alerta__encabezado" });
  encabezado.append(crearIcono("pendiente"), crearElemento("h3", { texto: "Vacunas próximas", atributos: { id: "vacunas-alerta-titulo" } }));
  const lista = crearElemento("ul", { clase: "vacunas-alerta__lista" });

  if (estado.cargando) {
    lista.append(crearElemento("li", { clase: "vacunas-alerta__vacio", texto: "Consultando las próximas dosis…" }));
  } else if (estado.errorVacunas) {
    lista.append(crearElemento("li", { clase: "vacunas-alerta__vacio", texto: "No se pudo actualizar la información de vacunas." }));
  } else if (!proximas.length) {
    lista.append(crearElemento("li", { clase: "vacunas-alerta__vacio", texto: "No hay vacunas próximas para mostrar." }));
  } else {
    for (const { vacuna, dias } of proximas) {
      const elemento = crearElemento("li", { clase: "vacunas-alerta__elemento" });
      const identidad = crearElemento("span", { clase: "vacunas-alerta__nombre" });
      identidad.textContent = `${obtenerNombreVacuna(vacuna)} · ${obtenerNombreMascota(vacuna)}`;
      const fecha = crearElemento("span", { clase: "vacunas-alerta__detalle" });
      fecha.textContent = `${formatearFecha(vacuna.proxima_dosis)} · ${textoDias(dias)}`;
      elemento.append(identidad, fecha);
      lista.append(elemento);
    }
  }
  alerta.replaceChildren(encabezado, lista);
}

/** Crea un campo de detalle en pares etiqueta/valor sin interpretar texto recibido del servidor. */
function crearDatoDetalle(etiqueta, valor, { clase = "" } = {}) {
  const dato = crearElemento("div", { clase: `vacunas-detalle__dato${clase ? ` ${clase}` : ""}` });
  dato.append(
    crearElemento("dt", { texto: etiqueta }),
    crearElemento("dd", { texto: valor || "No registrado" })
  );
  return dato;
}

/** Construye la fila expandida con información complementaria de la aplicación. */
function crearFilaDetalle(vacuna, idDetalle) {
  const fila = crearElemento("tr", { clase: "vacunas-detalle" });
  const celda = crearElemento("td", { atributos: { colspan: "5" } });
  const contenido = crearElemento("dl", { clase: "vacunas-detalle__contenido", atributos: { id: idDetalle } });
  contenido.append(
    crearDatoDetalle("Veterinaria", vacuna?.nombre_veterinaria || vacuna?.veterinaria?.nombre),
    crearDatoDetalle("Veterinario", vacuna?.nombre_veterinario || vacuna?.veterinario?.nombre),
    crearDatoDetalle("Lote", vacuna?.lote),
    crearDatoDetalle("Observaciones", vacuna?.notas || vacuna?.observaciones, { clase: "vacunas-detalle__notas" })
  );
  celda.append(contenido);
  fila.append(celda);
  return fila;
}

/** Crea una fila interactiva del historial; activa el detalle con clic, Enter o barra espaciadora. */
function crearFilaVacuna(vacuna, indice) {
  const idRegistro = vacuna?.id ?? `${vacuna?.mascota_id || "mascota"}-${indice}`;
  const idDetalle = `vacuna-detalle-${indice}`;
  const expandida = String(estado.expandidaId) === String(idRegistro);
  const fila = crearElemento("tr", {
    clase: "vacunas-fila",
    atributos: {
      tabindex: "0",
      "aria-expanded": String(expandida),
      "aria-label": `Mostrar detalles de ${obtenerNombreVacuna(vacuna)} para ${obtenerNombreMascota(vacuna)}`,
      "data-vacuna-id": String(idRegistro)
    }
  });

  const celdaMascota = crearElemento("td");
  celdaMascota.append(crearElemento("span", { clase: "vacunas-tabla__mascota", texto: obtenerNombreMascota(vacuna) }));
  const celdaVacuna = crearElemento("td");
  celdaVacuna.append(crearElemento("span", { clase: "vacunas-tabla__vacuna", texto: obtenerNombreVacuna(vacuna) }));
  const celdaAplicacion = crearElemento("td", { texto: vacuna?.fecha_aplicacion ? formatearFecha(vacuna.fecha_aplicacion) : "No registrada" });
  const celdaProxima = crearElemento("td", { texto: vacuna?.proxima_dosis ? formatearFecha(vacuna.proxima_dosis) : "Sin próxima dosis" });
  const celdaEstado = crearElemento("td");
  const presentacion = obtenerPresentacionEstado(vacuna);
  celdaEstado.append(crearElemento("span", { clase: `pastilla ${presentacion.clase}`, texto: presentacion.etiqueta }));
  fila.append(celdaMascota, celdaVacuna, celdaAplicacion, celdaProxima, celdaEstado);

  const alternarDetalle = () => {
    estado.expandidaId = expandida ? null : idRegistro;
    renderizarTabla();
    const filas = estado.regiones.tabla.querySelectorAll("[data-vacuna-id]");
    for (const filaActual of filas) {
      if (filaActual.dataset.vacunaId === String(idRegistro)) {
        filaActual.focus();
        break;
      }
    }
  };
  fila.addEventListener("click", alternarDetalle);
  fila.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      alternarDetalle();
    }
  });

  return { fila, detalle: expandida ? crearFilaDetalle(vacuna, idDetalle) : null };
}

/** Dibuja la tabla, el detalle desplegable y los estados vacío/error. */
function renderizarTabla() {
  const contenedor = estado.regiones.tabla;
  if (estado.cargando) {
    renderizarCarga(contenedor, "Consultando tu historial de vacunación…");
    return;
  }
  if (estado.errorVacunas) {
    renderizarError(contenedor, estado.ultimoError);
    return;
  }

  const filtradas = obtenerVacunasFiltradas();
  if (!estado.vacunas.length) {
    renderizarVacio(contenedor, { sinMascotas: estado.mascotas.length === 0 && !estado.errorMascotas });
    return;
  }
  if (!filtradas.length) {
    renderizarVacio(contenedor, { filtrado: true });
    return;
  }

  const scroll = crearElemento("div", { clase: "vacunas-tabla-scroll", atributos: { role: "region", "aria-label": "Tabla de vacunas; desplaza horizontalmente en pantallas pequeñas", tabindex: "0" } });
  const tabla = crearElemento("table", { clase: "vacunas-tabla" });
  const thead = crearElemento("thead");
  const encabezado = crearElemento("tr");
  for (const titulo of ["Mascota", "Vacuna", "Fecha de aplicación", "Próxima dosis", "Estado"]) {
    encabezado.append(crearElemento("th", { texto: titulo, atributos: { scope: "col" } }));
  }
  thead.append(encabezado);
  const tbody = crearElemento("tbody");
  filtradas.forEach((vacuna, indice) => {
    const { fila, detalle } = crearFilaVacuna(vacuna, indice);
    tbody.append(fila);
    if (detalle) tbody.append(detalle);
  });
  tabla.append(thead, tbody);
  scroll.append(tabla);
  contenedor.replaceChildren(scroll);
}

/** Actualiza tabla y filtros sin cambiar el conjunto base usado por los contadores. */
function renderizarVista() {
  renderizarContadores();
  renderizarAlerta();
  renderizarTabla();
}

/** Actualiza aria-pressed y la categoría de las pastillas de filtro. */
function actualizarBotonesFiltro() {
  for (const boton of estado.regiones.botonesFiltro) {
    boton.setAttribute("aria-pressed", String(boton.dataset.filtro === estado.filtroEstado));
  }
}

/** Cambia filtro de estado, mantiene los contadores y vuelve a dibujar la tabla. */
function cambiarFiltro(filtro) {
  if (!FILTROS.some((item) => item.valor === filtro)) return;
  estado.filtroEstado = filtro;
  estado.expandidaId = null;
  actualizarBotonesFiltro();
  renderizarTabla();
}

/** Carga mascotas activas para permitir acotar el carnet a un animal concreto. */
async function cargarMascotas() {
  const select = estado.regiones.selectMascota;
  select.disabled = true;
  select.replaceChildren(crearElemento("option", { texto: "Cargando mascotas…", atributos: { value: "" } }));
  try {
    const respuesta = await api.mascotas.listar({ activa: true });
    estado.mascotas = obtenerColeccion(respuesta, ["datos", "mascotas"]);
    estado.errorMascotas = false;
    select.replaceChildren(crearElemento("option", { texto: "Todas las mascotas", atributos: { value: "" } }));
    for (const mascota of estado.mascotas) {
      select.append(crearElemento("option", { texto: mascota?.nombre || "Mascota", atributos: { value: mascota?.id } }));
    }
    select.disabled = estado.mascotas.length === 0;
    if (!estado.mascotas.length) {
      estado.regiones.mensajeMascotas.textContent = "Primero registra una mascota para consultar su carnet.";
      estado.regiones.mensajeMascotas.hidden = false;
    } else {
      estado.regiones.mensajeMascotas.textContent = "";
      estado.regiones.mensajeMascotas.hidden = true;
    }
  } catch (error) {
    estado.errorMascotas = true;
    select.replaceChildren(crearElemento("option", { texto: "No se pudieron cargar las mascotas", atributos: { value: "" } }));
    select.disabled = true;
    estado.regiones.mensajeMascotas.textContent = error instanceof ApiError ? error.error || error.message : "No se pudo cargar el filtro de mascotas.";
    estado.regiones.mensajeMascotas.hidden = false;
  }
}

/** Consulta el carnet para la mascota seleccionada; estado se deja vacío para conservar todos los contadores. */
async function cargarVacunas() {
  const secuencia = ++estado.secuencia;
  estado.cargando = true;
  estado.errorVacunas = false;
  estado.ultimoError = null;
  estado.vacunas = [];
  estado.expandidaId = null;
  renderizarContadores();
  renderizarAlerta();
  renderizarTabla();
  try {
    const parametros = {};
    if (estado.mascotaId) parametros.mascota_id = estado.mascotaId;
    const respuesta = await api.vacunas.listarCarnet(parametros);
    if (secuencia !== estado.secuencia) return;
    estado.vacunas = obtenerColeccion(respuesta, ["datos", "vacunas", "vacunaciones"]);
    estado.cargando = false;
    estado.errorVacunas = false;
    estado.ultimoError = null;
    renderizarVista();
  } catch (error) {
    if (secuencia !== estado.secuencia) return;
    estado.cargando = false;
    estado.errorVacunas = true;
    estado.ultimoError = error;
    renderizarContadores();
    renderizarAlerta();
    renderizarError(estado.regiones.tabla, error);
  }
}

/** Crea filtros, selector y mensaje de ayuda con etiquetas accesibles. */
function crearControles() {
  const controles = crearElemento("section", { clase: "vacunas-controles", atributos: { "aria-label": "Filtros del carnet de vacunación" } });
  const filtros = crearElemento("div", { clase: "vacunas-filtros", atributos: { role: "group", "aria-label": "Filtrar por estado" } });
  const botonesFiltro = [];
  for (const filtro of FILTROS) {
    const boton = crearElemento("button", {
      clase: "vacunas-filtro-boton",
      texto: filtro.etiqueta,
      atributos: { type: "button", "aria-pressed": String(filtro.valor === estado.filtroEstado), "data-filtro": filtro.valor }
    });
    boton.addEventListener("click", () => cambiarFiltro(filtro.valor));
    filtros.append(boton);
    botonesFiltro.push(boton);
  }

  const campoMascota = crearElemento("div", { clase: "vacunas-filtro-mascota" });
  const etiqueta = crearElemento("label", { texto: "Filtrar por mascota", atributos: { for: "filtro-mascota-vacunas" } });
  const select = crearElemento("select", { atributos: { id: "filtro-mascota-vacunas", name: "mascota_id", disabled: "" } });
  select.append(crearElemento("option", { texto: "Cargando mascotas…", atributos: { value: "" } }));
  select.addEventListener("change", () => {
    estado.mascotaId = select.value;
    estado.filtroEstado = "todas";
    actualizarBotonesFiltro();
    cargarVacunas();
  });
  const mensaje = crearElemento("small", { clase: "vacunas-sin-mascotas", atributos: { id: "vacunas-mensaje-mascotas", role: "status", hidden: "" } });
  campoMascota.append(etiqueta, select, mensaje);
  controles.append(filtros, campoMascota);
  return { controles, select, mensaje, botonesFiltro };
}

/** Construye el contenido principal dentro de la barra lateral y superior compartidas. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "vacunas-pagina" });
  const intro = crearElemento("header", { clase: "vacunas-intro" });
  const sobrelinea = crearElemento("p", { clase: "vacunas-intro__sobrelinea" });
  sobrelinea.append(crearIcono("vacuna"), document.createTextNode("Salud y prevención"));
  intro.append(
    sobrelinea,
    crearElemento("h2", { texto: "Vacunas", atributos: { id: "vacunas-titulo" } }),
    crearElemento("p", { texto: "Carnet digital de vacunación de tus mascotas." })
  );

  const contadores = crearElemento("section", { clase: "vacunas-contadores", atributos: { "aria-label": "Resumen de vacunación", "aria-live": "polite" } });
  for (const mensaje of ["Cargando", "Cargando", "Cargando"]) {
    contadores.append(crearElemento("article", { clase: "vacunas-contador", texto: mensaje }));
  }

  const controles = crearControles();
  const alerta = crearElemento("section", { clase: "vacunas-alerta", atributos: { "aria-labelledby": "vacunas-alerta-titulo", "aria-live": "polite" } });
  const alertaEncabezado = crearElemento("div", { clase: "vacunas-alerta__encabezado" });
  alertaEncabezado.append(crearIcono("pendiente"), crearElemento("h3", { texto: "Vacunas próximas", atributos: { id: "vacunas-alerta-titulo" } }));
  alerta.append(alertaEncabezado, crearElemento("p", { clase: "vacunas-alerta__vacio", texto: "Consultando las próximas dosis…" }));
  const tablaCard = crearElemento("section", { clase: "vacunas-tabla-card", atributos: { "aria-labelledby": "vacunas-tabla-titulo" } });
  const tablaEncabezado = crearElemento("header", { clase: "vacunas-tabla-encabezado" });
  tablaEncabezado.append(
    crearElemento("h3", { texto: "Carnet de vacunación", atributos: { id: "vacunas-tabla-titulo" } }),
    crearElemento("p", { texto: "Selecciona una fila para consultar los detalles de la aplicación." })
  );
  const tabla = crearElemento("div", { atributos: { id: "vacunas-tabla-contenido" } });
  renderizarCarga(tabla, "Consultando tu historial de vacunación…");
  tablaCard.append(tablaEncabezado, tabla);
  pagina.append(intro, contadores, controles.controles, alerta, tablaCard);
  contenedor.replaceChildren(pagina);

  return {
    pagina,
    contadores,
    alerta,
    tabla,
    selectMascota: controles.select,
    mensajeMascotas: controles.mensaje,
    botonesFiltro: controles.botonesFiltro
  };
}

/** Presenta un error recuperable si GET /api/sesion no puede validar la cuenta. */
function mostrarErrorSesion(contenedor, error) {
  contenedor.setAttribute("aria-busy", "false");
  const tarjeta = crearElemento("section", { clase: "vacunas-sesion-error__tarjeta" });
  tarjeta.append(
    crearElemento("h1", { texto: "No pudimos conectar con PetCare" }),
    crearElemento("p", { texto: error instanceof ApiError ? error.error || error.message : error?.message || "Ocurrió un error al validar tu sesión." })
  );
  const acciones = crearElemento("div", { clase: "vacunas-error__acciones" });
  const reintentar = crearElemento("button", { clase: "boton", texto: "Volver a intentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", iniciar);
  acciones.append(reintentar, crearElemento("a", { clase: "boton boton--secundario", texto: "Ir al inicio de sesión", atributos: { href: RUTAS.login } }));
  tarjeta.append(acciones);
  const region = crearElemento("main", { clase: "vacunas-sesion-error", atributos: { role: "alert" } });
  region.append(tarjeta);
  contenedor.replaceChildren(region);
}

/** Protege la página para usuarios, monta el layout común y carga catálogos y carnet. */
async function iniciar() {
  const raiz = document.querySelector("#app");
  if (!raiz) return;
  raiz.setAttribute("aria-busy", "true");

  try {
    estado.sesion = await protegerPagina({
      roles: ["usuario"],
      loginUrl: RUTAS.login,
      inicioUrl: RUTAS.admin
    });
  } catch (error) {
    mostrarErrorSesion(raiz, error);
    return;
  }
  if (!estado.sesion) return;

  try {
    const layout = montarLayout({
      contenedor: raiz,
      sesion: estado.sesion,
      titulo: "Vacunas",
      paginaActual: "/vacunas.html",
      onBuscar: (termino) => {
        estado.busqueda = termino;
        renderizarTabla();
      },
      contadorNotificaciones: estado.sesion.notificaciones_sin_leer
    });
    estado.regiones = construirPagina(layout.contenido);
    raiz.setAttribute("aria-busy", "false");
    await cargarMascotas();
    await cargarVacunas();
  } catch (error) {
    mostrarErrorSesion(raiz, error);
  }
}

iniciar();
