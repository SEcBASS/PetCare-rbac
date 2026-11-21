/**
 * Módulo 14: catálogos administrativos de PetCare.
 * Usa los endpoints REST de js/api.js; el servidor conserva las relaciones y aplica
 * desactivación lógica cuando un registro está relacionado con otros datos.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html" };
const DIAS = [
  { numero: 1, nombre: "Lunes" },
  { numero: 2, nombre: "Martes" },
  { numero: 3, nombre: "Miércoles" },
  { numero: 4, nombre: "Jueves" },
  { numero: 5, nombre: "Viernes" },
  { numero: 6, nombre: "Sábado" },
  { numero: 7, nombre: "Domingo" }
];

const CATALOGOS = {
  veterinarias: {
    recurso: "veterinarias",
    titulo: "Veterinarias",
    singular: "veterinaria",
    vacio: "Aún no hay veterinarias en el catálogo",
    descripcionVacia: "Registra una veterinaria para que pueda aparecer en las búsquedas y para que el administrador pueda agendar citas.",
    descripcion: "Gestiona los centros veterinarios, sus datos de contacto, ubicación, etiquetas y horarios de atención."
  },
  vacunas: {
    recurso: "vacunas",
    titulo: "Vacunas",
    singular: "vacuna",
    vacio: "Aún no hay vacunas en el catálogo",
    descripcionVacia: "Agrega las vacunas que podrán seleccionarse al registrar el carnet de vacunación de perros y gatos.",
    descripcion: "Define las vacunas disponibles, la especie a la que aplican y el intervalo de refuerzo."
  },
  motivos: {
    recurso: "motivos-consulta",
    titulo: "Motivos de consulta",
    singular: "motivo de consulta",
    vacio: "Aún no hay motivos de consulta en el catálogo",
    descripcionVacia: "Crea motivos como consulta general, control o urgencia para que puedan utilizarse al agendar citas.",
    descripcion: "Mantén organizado el listado de motivos que el administrador puede asignar a una cita."
  }
};

const estado = {
  sesion: null,
  layout: null,
  pagina: null,
  panel: null,
  dialogo: null,
  toast: null,
  pestana: "veterinarias",
  registros: { veterinarias: [], vacunas: [], motivos: [] },
  cargando: { veterinarias: false, vacunas: false, motivos: false },
  cargandoEspecies: false,
  promesaEspecies: null,
  especies: [],
  errorEspecies: "",
  secuencias: { veterinarias: 0, vacunas: 0, motivos: 0 },
  guardando: false,
  registroEditando: null,
  regiones: null,
  temporizadorToast: null
};

/** Crea nodos y asigna los datos recibidos como texto, nunca como HTML. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null) continue;
    if (valor === false) nodo.removeAttribute(nombre);
    else if (valor === true && nombre === "disabled") nodo.disabled = true;
    else nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Lee las colecciones que el backend devuelve en { datos: [...] }. */
function obtenerDatos(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

/** Normaliza errores del contrato común { error, campos }. */
function mensajeError(error, alternativo) {
  const principal = error instanceof ApiError ? error.error || error.message : error?.message || alternativo;
  const campos = error instanceof ApiError ? error.campos : error?.campos;
  if (!campos || typeof campos !== "object") return principal;
  const detalles = Object.entries(campos).flatMap(([campo, valor]) => {
    const valores = Array.isArray(valor) ? valor : [valor];
    return valores.map((item) => `${campo}: ${typeof item === "string" ? item : item?.mensaje || "Revisa este dato."}`);
  });
  return detalles.length ? `${principal} ${detalles.join(" ")}` : principal;
}

/** Convierte banderas de MySQL o JSON a booleanos sin perder el estado inactivo. */
function estaActivo(registro, clave = "activa") {
  const valor = registro?.[clave];
  return valor === undefined || valor === null ? true : valor === true || Number(valor) === 1;
}

function formatearFecha(valor) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(fecha);
}

function crearBoton(texto, clase, accion, atributos = {}) {
  const boton = crearElemento("button", {
    clase,
    texto,
    atributos: { type: "button", ...atributos }
  });
  if (typeof accion === "function") boton.addEventListener("click", accion);
  return boton;
}

function crearCampo(etiqueta, id, tipo = "text", atributos = {}) {
  const grupo = crearElemento("div", { clase: "admin-catalogos__campo" });
  const label = crearElemento("label", { texto: etiqueta, atributos: { for: id } });
  let control;
  if (tipo === "textarea") control = crearElemento("textarea", { atributos: { id, name: id, ...atributos } });
  else if (tipo === "select") control = crearElemento("select", { atributos: { id, name: id, ...atributos } });
  else control = crearElemento("input", { atributos: { id, name: id, type: tipo, ...atributos } });
  grupo.append(label, control);
  return { grupo, control };
}

function crearCheckbox(etiqueta, id, valor) {
  const grupo = crearElemento("div", { clase: "admin-catalogos__checkbox" });
  const control = crearElemento("input", { atributos: { id, name: id, type: "checkbox" } });
  control.checked = Boolean(valor);
  grupo.append(control, crearElemento("label", { texto: etiqueta, atributos: { for: id } }));
  return { grupo, control };
}

function agregarOpcion(select, valor, etiqueta, seleccionado = false) {
  const opcion = crearElemento("option", { texto: etiqueta, atributos: { value: valor } });
  opcion.selected = seleccionado;
  select.append(opcion);
}

function mostrarToast(mensaje, tipo = "exito") {
  estado.toast.textContent = mensaje;
  estado.toast.dataset.tipo = tipo;
  estado.toast.hidden = false;
  if (estado.temporizadorToast) window.clearTimeout(estado.temporizadorToast);
  estado.temporizadorToast = window.setTimeout(() => { estado.toast.hidden = true; }, 4200);
}

function mostrarErrorPanel(titulo, mensaje) {
  const bloque = crearElemento("section", { clase: "admin-catalogos__estado admin-catalogos__estado--error", atributos: { role: "alert" } });
  bloque.append(crearElemento("h3", { texto: titulo }), crearElemento("p", { texto: mensaje }));
  bloque.append(crearBoton("Reintentar", "admin-catalogos__boton admin-catalogos__boton--secundario", () => cargarCatalogo(estado.pestana)));
  estado.panel.replaceChildren(bloque);
}

function crearEstadoVacio(titulo, descripcion) {
  const bloque = crearElemento("section", { clase: "admin-catalogos__estado" });
  bloque.append(crearElemento("h3", { texto: titulo }), crearElemento("p", { texto: descripcion }));
  return bloque;
}

/** Arma la cabecera de página, las pestañas, el panel y el diálogo compartido. */
function construirPagina(contenedor) {
  const pagina = crearElemento("main", { clase: "admin-catalogos", atributos: { id: "contenido-principal" } });
  const intro = crearElemento("header", { clase: "admin-catalogos__intro" });
  const titulos = crearElemento("div");
  titulos.append(
    crearElemento("p", { clase: "admin-catalogos__sobrelinea", texto: "Administración de PetCare" }),
    crearElemento("h1", { clase: "admin-catalogos__titulo", texto: "Catálogos" }),
    crearElemento("p", { clase: "admin-catalogos__descripcion", texto: "Configura los datos maestros que utilizan las citas, las veterinarias y el carnet de vacunación." })
  );
  intro.append(titulos);

  const nota = crearElemento("aside", { clase: "admin-catalogos__nota" });
  nota.append(
    crearElemento("span", { clase: "admin-catalogos__nota-icono", texto: "i", atributos: { "aria-hidden": "true" } }),
    crearElemento("p", { texto: "Los catálogos pueden tener registros relacionados. En ese caso, se desactivan para conservar el historial; no se eliminan físicamente desde esta pantalla." })
  );

  const pestanas = crearElemento("div", { clase: "admin-catalogos__pestanas", atributos: { role: "tablist", "aria-label": "Catálogos" } });
  const botonesPestana = {};
  const especificaciones = [
    ["veterinarias", "Veterinarias", "01"],
    ["vacunas", "Vacunas", "02"],
    ["motivos", "Motivos de consulta", "03"]
  ];
  for (const [clave, etiqueta, numero] of especificaciones) {
    const boton = crearElemento("button", {
      clase: "admin-catalogos__pestana",
      texto: etiqueta,
      atributos: { type: "button", role: "tab", id: `pestana-${clave}`, "aria-controls": "panel-catalogos", "aria-selected": String(clave === estado.pestana), tabindex: clave === estado.pestana ? "0" : "-1" }
    });
    const indicador = crearElemento("span", { clase: "admin-catalogos__pestana-numero", texto: numero });
    boton.prepend(indicador);
    boton.addEventListener("click", () => cambiarPestana(clave));
    boton.addEventListener("keydown", (evento) => manejarTecladoPestanas(evento, especificaciones.map((fila) => fila[0])));
    pestanas.append(boton);
    botonesPestana[clave] = boton;
  }

  const panel = crearElemento("section", { clase: "admin-catalogos__panel", atributos: { id: "panel-catalogos", role: "tabpanel", tabindex: "0", "aria-labelledby": `pestana-${estado.pestana}`, "aria-live": "polite" } });
  const dialogo = crearElemento("dialog", { clase: "admin-catalogos__dialogo", atributos: { "aria-labelledby": "admin-catalogos-dialogo-titulo" } });
  const toast = crearElemento("div", { clase: "admin-catalogos__toast", atributos: { role: "status", "aria-live": "polite", hidden: "" } });

  pagina.append(intro, nota, pestanas, panel);
  contenedor.replaceChildren(pagina, dialogo, toast);
  estado.pagina = pagina;
  estado.panel = panel;
  estado.dialogo = dialogo;
  estado.toast = toast;
  estado.regiones = { botonesPestana };
  renderizarPanel();
}

function manejarTecladoPestanas(evento, claves) {
  const teclas = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!teclas.includes(evento.key)) return;
  evento.preventDefault();
  const actual = claves.indexOf(estado.pestana);
  let indice = actual;
  if (evento.key === "ArrowRight") indice = (actual + 1) % claves.length;
  if (evento.key === "ArrowLeft") indice = (actual - 1 + claves.length) % claves.length;
  if (evento.key === "Home") indice = 0;
  if (evento.key === "End") indice = claves.length - 1;
  cambiarPestana(claves[indice]);
  estado.regiones.botonesPestana[claves[indice]].focus();
}

async function cambiarPestana(clave) {
  if (!CATALOGOS[clave] || clave === estado.pestana) return;
  estado.pestana = clave;
  for (const [nombre, boton] of Object.entries(estado.regiones.botonesPestana)) {
    const activo = nombre === clave;
    boton.setAttribute("aria-selected", String(activo));
    boton.setAttribute("tabindex", activo ? "0" : "-1");
  }
  estado.panel.setAttribute("aria-labelledby", `pestana-${clave}`);
  renderizarPanel();
  await cargarCatalogo(clave);
}

function renderizarPanel() {
  const config = CATALOGOS[estado.pestana];
  const cabecera = crearElemento("header", { clase: "admin-catalogos__panel-cabecera" });
  const titulos = crearElemento("div");
  titulos.append(crearElemento("h2", { texto: config.titulo }), crearElemento("p", { texto: config.descripcion }));
  const botonNuevo = crearBoton(`+ Nueva ${config.singular}`, "admin-catalogos__boton", () => abrirFormulario(estado.pestana));
  cabecera.append(titulos, botonNuevo);

  const resumen = crearElemento("div", { clase: "admin-catalogos__resumen" });
  resumen.append(crearElemento("span", { texto: estado.cargando[estado.pestana] ? "Consultando el catálogo…" : `${estado.registros[estado.pestana].length} registro(s)` }));
  estado.panel.replaceChildren(cabecera, resumen);
  if (estado.cargando[estado.pestana]) {
    estado.panel.append(crearEstadoVacio("Cargando catálogo", "Los registros se están consultando en el servidor."));
    return;
  }
  renderizarRegistros(estado.pestana, estado.registros[estado.pestana]);
}

/** Consulta la colección real del backend y descarta respuestas antiguas de pestañas anteriores. */
async function cargarCatalogo(clave, { silencioso = false } = {}) {
  const config = CATALOGOS[clave];
  const secuencia = ++estado.secuencias[clave];
  estado.cargando[clave] = true;
  if (clave === estado.pestana) renderizarPanel();
  try {
    const respuesta = await api.admin.listarCatalogo(config.recurso);
    if (secuencia !== estado.secuencias[clave]) return false;
    estado.registros[clave] = obtenerDatos(respuesta);
    estado.cargando[clave] = false;
    if (clave === estado.pestana) renderizarPanel();
    return true;
  } catch (error) {
    if (secuencia !== estado.secuencias[clave]) return false;
    estado.cargando[clave] = false;
    if (clave === estado.pestana) {
      if (silencioso) mostrarToast(mensajeError(error, `No fue posible actualizar ${config.titulo.toLowerCase()}.`), "error");
      else mostrarErrorPanel(`No fue posible cargar ${config.titulo.toLowerCase()}`, mensajeError(error, "Comprueba la conexión e inténtalo de nuevo."));
    }
    return false;
  }
}

function crearCelda(tabla, etiqueta, contenido) {
  const celda = crearElemento("td", { atributos: { "data-label": etiqueta } });
  if (contenido instanceof Node) celda.append(contenido);
  else celda.textContent = textoSeguro(contenido ?? "—");
  tabla.append(celda);
  return celda;
}

function crearBadgeEstado(activo) {
  return crearElemento("span", {
    clase: `admin-catalogos__estado-registro${activo ? "" : " admin-catalogos__estado-registro--inactivo"}`,
    texto: activo ? "Activo" : "Inactivo"
  });
}

function crearAcciones(registro, clave) {
  const acciones = crearElemento("div", { clase: "admin-catalogos__acciones" });
  acciones.append(crearBoton("Editar", "admin-catalogos__boton admin-catalogos__boton--secundario admin-catalogos__boton--pequeno", () => abrirFormulario(clave, registro)));
  const campoEstado = clave === "motivos" ? "activo" : "activa";
  const activo = estaActivo(registro, campoEstado);
  const texto = activo ? "Desactivar" : "Activar";
  const clase = activo
    ? "admin-catalogos__boton admin-catalogos__boton--peligro admin-catalogos__boton--pequeno"
    : "admin-catalogos__boton admin-catalogos__boton--secundario admin-catalogos__boton--pequeno";
  acciones.append(crearBoton(texto, clase, () => cambiarEstadoRegistro(clave, registro, !activo)));
  return acciones;
}

function crearTabla(encabezados) {
  const contenedor = crearElemento("div", { clase: "admin-catalogos__tabla-contenedor" });
  const tabla = crearElemento("table", { clase: "admin-catalogos__tabla" });
  const head = crearElemento("thead");
  const fila = crearElemento("tr");
  for (const titulo of encabezados) fila.append(crearElemento("th", { texto: titulo, atributos: { scope: "col" } }));
  head.append(fila);
  tabla.append(head, crearElemento("tbody"));
  contenedor.append(tabla);
  return { contenedor, cuerpo: tabla.querySelector("tbody") };
}

function renderizarRegistros(clave, registros) {
  const config = CATALOGOS[clave];
  if (!registros.length) {
    estado.panel.append(crearEstadoVacio(config.vacio, config.descripcionVacia));
    return;
  }
  if (clave === "veterinarias") renderizarVeterinarias(registros);
  else if (clave === "vacunas") renderizarVacunas(registros);
  else renderizarMotivos(registros);
}

function obtenerEtiquetas(valor) {
  if (Array.isArray(valor)) return valor.map((item) => String(item).trim()).filter(Boolean);
  if (typeof valor === "string" && valor.trim()) {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch { /* El formato simple separado por comas también es válido. */ }
    return valor.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function horarioDe(registro) {
  const horarios = registro?.horarios ?? registro?.horarios_veterinaria ?? [];
  return Array.isArray(horarios) ? horarios : [];
}

function resumenHorarios(registro) {
  const horarios = horarioDe(registro);
  if (!horarios.length) return "Sin horarios registrados";
  const partes = DIAS.map((dia) => {
    const tramos = horarios.filter((horario) => Number(horario.dia_semana) === dia.numero)
      .sort((a, b) => String(a.hora_apertura).localeCompare(String(b.hora_apertura)));
    if (!tramos.length) return "";
    const nombre = dia.nombre.slice(0, 3);
    return `${nombre}: ${tramos.map((tramo) => `${String(tramo.hora_apertura || "").slice(0, 5)}–${String(tramo.hora_cierre || "").slice(0, 5)}`).join(", ")}`;
  }).filter(Boolean);
  return partes.join(" · ");
}

function renderizarVeterinarias(registros) {
  const tabla = crearTabla(["Veterinaria", "Contacto y ubicación", "Etiquetas", "Horarios", "Estado", "Acciones"]);
  for (const registro of registros) {
    const fila = crearElemento("tr");
    const nombre = crearElemento("div");
    nombre.append(crearElemento("span", { clase: "admin-catalogos__nombre", texto: registro.nombre || "Sin nombre" }),
      crearElemento("span", { clase: "admin-catalogos__detalle", texto: `ID ${registro.id ?? "—"} · Creada ${formatearFecha(registro.creado_en)}` }));
    crearCelda(fila, "Veterinaria", nombre);

    const contacto = crearElemento("div");
    contacto.append(crearElemento("span", { texto: [registro.direccion, registro.ciudad, registro.pais].filter(Boolean).join(" · ") || "Sin dirección registrada" }),
      crearElemento("span", { clase: "admin-catalogos__detalle", texto: [registro.telefono, registro.correo].filter(Boolean).join(" · ") || "Sin teléfono ni correo" }),
      crearElemento("span", { clase: "admin-catalogos__detalle", texto: `Lat. ${registro.latitud ?? "—"} · Long. ${registro.longitud ?? "—"}` }));
    crearCelda(fila, "Contacto y ubicación", contacto);

    const etiquetas = crearElemento("div", { clase: "admin-catalogos__etiquetas" });
    for (const etiqueta of obtenerEtiquetas(registro.etiquetas)) etiquetas.append(crearElemento("span", { clase: "admin-catalogos__etiqueta", texto: etiqueta }));
    if (!etiquetas.childElementCount) etiquetas.append(crearElemento("span", { clase: "admin-catalogos__detalle", texto: "Sin etiquetas" }));
    crearCelda(fila, "Etiquetas", etiquetas);
    crearCelda(fila, "Horarios", resumenHorarios(registro));
    crearCelda(fila, "Estado", crearBadgeEstado(estaActivo(registro)));
    crearCelda(fila, "Acciones", crearAcciones(registro, "veterinarias"));
    tabla.cuerpo.append(fila);
  }
  estado.panel.append(tabla.contenedor);
}

function nombreEspecie(registro) {
  if (registro.especie_nombre || registro.nombre_especie) return registro.especie_nombre || registro.nombre_especie;
  if (registro.especie_id === null || registro.especie_id === undefined || registro.especie_id === "") return "Ambas (perro y gato)";
  const especie = estado.especies.find((item) => String(item.id) === String(registro.especie_id));
  return especie?.nombre || "Especie asociada";
}

function renderizarVacunas(registros) {
  const tabla = crearTabla(["Vacuna", "Especie", "Refuerzo", "Estado", "Acciones"]);
  for (const registro of registros) {
    const fila = crearElemento("tr");
    const nombre = crearElemento("div");
    nombre.append(crearElemento("span", { clase: "admin-catalogos__nombre", texto: registro.nombre || "Sin nombre" }),
      crearElemento("span", { clase: "admin-catalogos__detalle", texto: registro.descripcion || "Sin descripción" }));
    crearCelda(fila, "Vacuna", nombre);
    crearCelda(fila, "Especie", nombreEspecie(registro));
    crearCelda(fila, "Refuerzo", registro.intervalo_refuerzo_dias ? `${registro.intervalo_refuerzo_dias} días` : "No definido");
    crearCelda(fila, "Estado", crearBadgeEstado(estaActivo(registro)));
    crearCelda(fila, "Acciones", crearAcciones(registro, "vacunas"));
    tabla.cuerpo.append(fila);
  }
  estado.panel.append(tabla.contenedor);
}

function renderizarMotivos(registros) {
  const tabla = crearTabla(["Motivo de consulta", "Estado", "Acciones"]);
  for (const registro of registros) {
    const fila = crearElemento("tr");
    const nombre = crearElemento("div");
    nombre.append(crearElemento("span", { clase: "admin-catalogos__nombre", texto: registro.nombre || "Sin nombre" }),
      crearElemento("span", { clase: "admin-catalogos__detalle", texto: `ID ${registro.id ?? "—"}` }));
    crearCelda(fila, "Motivo", nombre);
    crearCelda(fila, "Estado", crearBadgeEstado(estaActivo(registro, "activo")));
    crearCelda(fila, "Acciones", crearAcciones(registro, "motivos"));
    tabla.cuerpo.append(fila);
  }
  estado.panel.append(tabla.contenedor);
}

/** Actualiza una bandera con PUT; no existe una operación de borrado desde esta pantalla. */
async function cambiarEstadoRegistro(clave, registro, activar) {
  const config = CATALOGOS[clave];
  const accion = activar ? "activar" : "desactivar";
  const mensaje = activar
    ? `¿Deseas activar «${registro.nombre}»? Volverá a estar disponible en los módulos que usan este catálogo.`
    : `¿Deseas desactivar «${registro.nombre}»? Se conservarán sus relaciones e historial.`;
  if (!window.confirm(mensaje)) return;
  const datos = clave === "veterinarias"
    ? {
        nombre: registro.nombre,
        direccion: registro.direccion ?? null,
        ciudad: registro.ciudad ?? null,
        pais: registro.pais ?? null,
        telefono: registro.telefono ?? null,
        correo: registro.correo ?? null,
        latitud: registro.latitud ?? null,
        longitud: registro.longitud ?? null,
        etiquetas: obtenerEtiquetas(registro.etiquetas),
        activa: activar,
        horarios: horarioDe(registro)
      }
    : clave === "vacunas"
      ? {
          nombre: registro.nombre,
          especie_id: registro.especie_id ?? null,
          descripcion: registro.descripcion ?? null,
          intervalo_refuerzo_dias: registro.intervalo_refuerzo_dias ?? null,
          activa: activar
        }
      : { nombre: registro.nombre, activo: activar };
  try {
    await api.admin.actualizarCatalogo(config.recurso, registro.id, datos);
    const recargado = await cargarCatalogo(clave, { silencioso: true });
    mostrarToast(recargado
      ? `${config.singular[0].toUpperCase()}${config.singular.slice(1)} ${accion === "activar" ? "activada" : "desactivada"}.`
      : "El cambio se guardó, pero no se pudo recargar el catálogo.", recargado ? "exito" : "error");
  } catch (error) {
    mostrarToast(mensajeError(error, `No fue posible ${accion} el registro.`), "error");
  }
}

function prepararDialogo(titulo, descripcion) {
  const cabecera = crearElemento("header", { clase: "admin-catalogos__dialogo-cabecera" });
  const titulos = crearElemento("div");
  titulos.append(crearElemento("h2", { texto: titulo, atributos: { id: "admin-catalogos-dialogo-titulo" } }),
    crearElemento("p", { texto: descripcion }));
  const cerrar = crearBoton("×", "admin-catalogos__cerrar", cerrarDialogo, { "aria-label": "Cerrar formulario" });
  cabecera.append(titulos, cerrar);
  const formulario = crearElemento("form", { clase: "admin-catalogos__formulario", atributos: { novalidate: "" } });
  const grid = crearElemento("div", { clase: "admin-catalogos__form-grid" });
  const error = crearElemento("p", { clase: "admin-catalogos__mensaje admin-catalogos__mensaje--error", atributos: { role: "alert", hidden: "" } });
  const acciones = crearElemento("footer", { clase: "admin-catalogos__dialogo-acciones" });
  const cancelar = crearBoton("Cancelar", "admin-catalogos__boton admin-catalogos__boton--secundario", cerrarDialogo);
  const guardar = crearElemento("button", { clase: "admin-catalogos__boton", texto: "Guardar", atributos: { type: "submit" } });
  acciones.append(cancelar, guardar);
  formulario.append(grid, error, acciones);
  estado.dialogo.replaceChildren(cabecera, formulario);
  estado.regiones.formulario = formulario;
  estado.regiones.formGrid = grid;
  estado.regiones.errorDialogo = error;
  estado.regiones.guardar = guardar;
  formulario.addEventListener("submit", guardarFormulario);
  estado.dialogo.addEventListener("cancel", (evento) => {
    if (estado.guardando) evento.preventDefault();
  }, { once: true });
  if (typeof estado.dialogo.showModal === "function") estado.dialogo.showModal();
  else estado.dialogo.setAttribute("open", "");
}

function agregarCampoAlGrid(grid, campo, completo = false) {
  if (completo) campo.grupo.classList.add("admin-catalogos__campo--completo");
  grid.append(campo.grupo);
  return campo.control;
}

async function abrirFormulario(clave, registro = null) {
  if (estado.dialogo.open) return;
  if (clave === "vacunas") await asegurarEspecies();
  if (estado.dialogo.open) return;
  estado.registroEditando = registro;
  estado.regiones.claveFormulario = clave;
  const config = CATALOGOS[clave];
  const modo = registro ? "Editar" : "Nueva";
  prepararDialogo(`${modo} ${config.singular}`, registro ? "Actualiza los datos del catálogo seleccionado." : "Completa los datos para agregar un nuevo registro al catálogo.");
  if (clave === "veterinarias") construirFormularioVeterinaria(registro);
  else if (clave === "vacunas") construirFormularioVacuna(registro);
  else construirFormularioMotivo(registro);
  estado.dialogo.querySelector("input, select, textarea")?.focus();
}

function construirFormularioVeterinaria(registro) {
  const grid = estado.regiones.formGrid;
  const nombre = agregarCampoAlGrid(grid, crearCampo("Nombre de la veterinaria", "cat-vet-nombre", "text", { maxlength: "120", required: "", autocomplete: "organization" }));
  const direccion = agregarCampoAlGrid(grid, crearCampo("Dirección", "cat-vet-direccion", "text", { maxlength: "200", autocomplete: "street-address" }));
  const ciudad = agregarCampoAlGrid(grid, crearCampo("Ciudad", "cat-vet-ciudad", "text", { maxlength: "100", autocomplete: "address-level2" }));
  const pais = agregarCampoAlGrid(grid, crearCampo("País (código de 2 letras)", "cat-vet-pais", "text", { maxlength: "2", minlength: "2", autocomplete: "country", placeholder: "CO" }));
  const telefono = agregarCampoAlGrid(grid, crearCampo("Teléfono", "cat-vet-telefono", "tel", { maxlength: "25", autocomplete: "tel" }));
  const correo = agregarCampoAlGrid(grid, crearCampo("Correo electrónico", "cat-vet-correo", "email", { maxlength: "150", autocomplete: "email" }));
  const latitud = agregarCampoAlGrid(grid, crearCampo("Latitud", "cat-vet-latitud", "number", { min: "-90", max: "90", step: "0.000001", placeholder: "Ej. 10.987800" }));
  const longitud = agregarCampoAlGrid(grid, crearCampo("Longitud", "cat-vet-longitud", "number", { min: "-180", max: "180", step: "0.000001", placeholder: "Ej. -74.788900" }));
  const etiquetas = agregarCampoAlGrid(grid, crearCampo("Etiquetas", "cat-vet-etiquetas", "text", { maxlength: "500", placeholder: "Urgencias, 24 horas, cirugía…" }), true);
  etiquetas.setAttribute("aria-describedby", "cat-vet-etiquetas-ayuda");
  etiquetas.after(crearElemento("small", { clase: "admin-catalogos__ayuda", texto: "Separa las etiquetas con comas.", atributos: { id: "cat-vet-etiquetas-ayuda" } }));
  nombre.value = registro?.nombre || "";
  direccion.value = registro?.direccion || "";
  ciudad.value = registro?.ciudad || "";
  pais.value = registro?.pais || "";
  telefono.value = registro?.telefono || "";
  correo.value = registro?.correo || "";
  latitud.value = registro?.latitud ?? "";
  longitud.value = registro?.longitud ?? "";
  etiquetas.value = obtenerEtiquetas(registro?.etiquetas).join(", ");

  const activo = crearCheckbox("Veterinaria activa", "cat-vet-activa", registro ? estaActivo(registro) : true);
  grid.append(activo.grupo);
  const meta = registro ? `ID: ${registro.id ?? "—"} · Creada: ${formatearFecha(registro.creado_en)}` : "El identificador y la fecha de creación serán asignados por el servidor.";
  grid.append(crearElemento("p", { clase: "admin-catalogos__metadatos admin-catalogos__campo--completo", texto: meta }));

  const horarios = crearElemento("section", { clase: "admin-catalogos__horarios", atributos: { "aria-labelledby": "cat-vet-horarios-titulo" } });
  const horariosCabecera = crearElemento("div", { clase: "admin-catalogos__horarios-cabecera" });
  horariosCabecera.append(crearElemento("h3", { texto: "Horarios por día", atributos: { id: "cat-vet-horarios-titulo" } }),
    crearElemento("span", { clase: "admin-catalogos__ayuda", texto: "Puedes añadir varios tramos por día." }));
  horarios.append(horariosCabecera);
  const dias = new Map();
  const existentes = horarioDe(registro);
  for (const dia of DIAS) {
    const tarjetaDia = crearElemento("section", { clase: "admin-catalogos__dia" });
    const cabecera = crearElemento("div", { clase: "admin-catalogos__dia-cabecera" });
    const tituloDia = crearElemento("strong", { texto: dia.nombre });
    const agregar = crearBoton("+ Añadir tramo", "admin-catalogos__boton admin-catalogos__boton--secundario admin-catalogos__boton--pequeno", () => agregarTramo(dia.numero));
    const lista = crearElemento("div", { clase: "admin-catalogos__tramos" });
    const sinTramos = crearElemento("p", { clase: "admin-catalogos__dia-vacio", texto: "Sin atención registrada." });
    cabecera.append(tituloDia, agregar);
    tarjetaDia.append(cabecera, sinTramos, lista);
    horarios.append(tarjetaDia);
    dias.set(dia.numero, { lista, sinTramos });
  }
  grid.append(horarios);
  estado.regiones.diasHorario = dias;
  estado.regiones.camposVeterinaria = { nombre, direccion, ciudad, pais, telefono, correo, latitud, longitud, etiquetas, activa: activo.control };
  for (const horario of existentes) agregarTramo(Number(horario.dia_semana), horario);
}

let secuenciaTramo = 0;
function agregarTramo(diaNumero, datos = {}) {
  const objetivo = estado.regiones.diasHorario.get(diaNumero);
  if (!objetivo) return;
  const fila = crearElemento("div", { clase: "admin-catalogos__tramo" });
  const sufijo = ++secuenciaTramo;
  const apertura = crearElemento("div", { clase: "admin-catalogos__campo" });
  const aperturaId = `cat-horario-apertura-${sufijo}`;
  apertura.append(crearElemento("label", { texto: "Desde", atributos: { for: aperturaId } }));
  const campoApertura = crearElemento("input", { atributos: { id: aperturaId, type: "time", required: "", "aria-label": `Hora de apertura ${DIAS[diaNumero - 1].nombre}` } });
  campoApertura.value = datos.hora_apertura ? String(datos.hora_apertura).slice(0, 5) : "";
  apertura.append(campoApertura);

  const cierre = crearElemento("div", { clase: "admin-catalogos__campo" });
  const cierreId = `cat-horario-cierre-${sufijo}`;
  cierre.append(crearElemento("label", { texto: "Hasta", atributos: { for: cierreId } }));
  const campoCierre = crearElemento("input", { atributos: { id: cierreId, type: "time", required: "", "aria-label": `Hora de cierre ${DIAS[diaNumero - 1].nombre}` } });
  campoCierre.value = datos.hora_cierre ? String(datos.hora_cierre).slice(0, 5) : "";
  cierre.append(campoCierre);

  const duracion = crearElemento("div", { clase: "admin-catalogos__campo" });
  const duracionId = `cat-horario-duracion-${sufijo}`;
  duracion.append(crearElemento("label", { texto: "Duración (min)", atributos: { for: duracionId } }));
  const campoDuracion = crearElemento("input", { atributos: { id: duracionId, type: "number", min: "5", max: "480", step: "5", required: "", "aria-label": `Duración de cita ${DIAS[diaNumero - 1].nombre}` } });
  campoDuracion.value = datos.duracion_cita_min ?? 30;
  duracion.append(campoDuracion);

  const quitar = crearBoton("Quitar", "admin-catalogos__quitar-tramo", () => {
    fila.remove();
    actualizarEstadoDia(diaNumero);
  });
  fila.append(apertura, cierre, duracion, quitar);
  objetivo.lista.append(fila);
  actualizarEstadoDia(diaNumero);
}

function actualizarEstadoDia(diaNumero) {
  const dia = estado.regiones.diasHorario.get(diaNumero);
  dia.sinTramos.hidden = dia.lista.childElementCount > 0;
}

async function asegurarEspecies() {
  if (estado.especies.length) return;
  if (estado.promesaEspecies) return estado.promesaEspecies;
  estado.cargandoEspecies = true;
  estado.errorEspecies = "";
  estado.promesaEspecies = (async () => {
    try {
      const respuesta = await api.admin.listarCatalogo("especies");
      estado.especies = obtenerDatos(respuesta);
      if (!estado.especies.length) estado.errorEspecies = "No hay especies en el catálogo ESPECIES. Deben estar registradas perro y gato para asociar las vacunas.";
    } catch (error) {
      estado.errorEspecies = mensajeError(error, "No fue posible consultar las especies.");
    } finally {
      estado.cargandoEspecies = false;
      estado.promesaEspecies = null;
    }
  })();
  return estado.promesaEspecies;
}

function construirFormularioVacuna(registro) {
  const grid = estado.regiones.formGrid;
  const nombre = agregarCampoAlGrid(grid, crearCampo("Nombre de la vacuna", "cat-vac-nombre", "text", { maxlength: "100", required: "" }));
  const especie = agregarCampoAlGrid(grid, crearCampo("Especie", "cat-vac-especie", "select", { required: "" }));
  agregarOpcion(especie, "", "Selecciona una especie");
  agregarOpcion(especie, "__ambas__", "Ambas (perro y gato)");
  for (const item of estado.especies) agregarOpcion(especie, String(item.id), item.nombre || `Especie ${item.id}`);
  if (registro?.especie_id === null || registro?.especie_id === undefined || registro?.especie_id === "") especie.value = "__ambas__";
  else especie.value = String(registro.especie_id);
  const intervalo = agregarCampoAlGrid(grid, crearCampo("Intervalo de refuerzo (días)", "cat-vac-intervalo", "number", { min: "1", max: "65535", step: "1", placeholder: "Opcional" }));
  const descripcion = agregarCampoAlGrid(grid, crearCampo("Descripción", "cat-vac-descripcion", "textarea", { maxlength: "255", placeholder: "Descripción breve de la vacuna…" }), true);
  const activa = crearCheckbox("Vacuna activa", "cat-vac-activa", registro ? estaActivo(registro) : true);
  grid.append(activa.grupo);
  nombre.value = registro?.nombre || "";
  intervalo.value = registro?.intervalo_refuerzo_dias ?? "";
  descripcion.value = registro?.descripcion || "";
  if (estado.errorEspecies) {
    const aviso = crearElemento("p", { clase: "admin-catalogos__mensaje admin-catalogos__mensaje--error", texto: estado.errorEspecies, atributos: { role: "alert" } });
    grid.append(aviso);
    especie.disabled = true;
    estado.regiones.guardar.disabled = true;
  } else if (!estado.especies.length) {
    especie.disabled = true;
    estado.regiones.guardar.disabled = true;
  }
  estado.regiones.camposVacuna = { nombre, especie, intervalo, descripcion, activa: activa.control };
}

function construirFormularioMotivo(registro) {
  const grid = estado.regiones.formGrid;
  const nombre = agregarCampoAlGrid(grid, crearCampo("Nombre del motivo de consulta", "cat-motivo-nombre", "text", { maxlength: "80", required: "" }), true);
  nombre.value = registro?.nombre || "";
  const activo = crearCheckbox("Motivo activo", "cat-motivo-activo", registro ? estaActivo(registro, "activo") : true);
  grid.append(activo.grupo);
  if (registro) grid.append(crearElemento("p", { clase: "admin-catalogos__metadatos admin-catalogos__campo--completo", texto: `ID: ${registro.id ?? "—"} · Creado: ${formatearFecha(registro.creado_en)}` }));
  estado.regiones.camposMotivo = { nombre, activo: activo.control };
}

function recolectarHorarios() {
  const horarios = [];
  for (const dia of DIAS) {
    const objetivo = estado.regiones.diasHorario.get(dia.numero);
    const tramos = [...objetivo.lista.querySelectorAll(".admin-catalogos__tramo")];
    const valoresDia = [];
    for (const tramo of tramos) {
      const campos = tramo.querySelectorAll("input");
      const [apertura, cierre, duracion] = [...campos].map((campo) => campo.value.trim());
      if (!apertura || !cierre || !duracion) throw new Error(`Completa las horas y la duración de cada tramo del día ${dia.nombre}.`);
      const inicioMin = minutosDeHora(apertura);
      const finMin = minutosDeHora(cierre);
      const minutos = Number(duracion);
      if (finMin <= inicioMin) throw new Error(`La hora de cierre debe ser posterior a la apertura del día ${dia.nombre}.`);
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) throw new Error(`La duración de las citas del día ${dia.nombre} debe estar entre 5 y 480 minutos.`);
      valoresDia.push({ inicioMin, finMin, dia_semana: dia.numero, hora_apertura: apertura, hora_cierre: cierre, duracion_cita_min: minutos });
    }
    valoresDia.sort((a, b) => a.inicioMin - b.inicioMin);
    for (let indice = 1; indice < valoresDia.length; indice += 1) {
      if (valoresDia[indice].inicioMin < valoresDia[indice - 1].finMin) throw new Error(`Los tramos del día ${dia.nombre} se superponen.`);
    }
    for (const tramo of valoresDia) {
      const { inicioMin, finMin, ...payload } = tramo;
      horarios.push(payload);
    }
  }
  return horarios;
}

function minutosDeHora(valor) {
  const [horas, minutos] = valor.split(":").map(Number);
  return horas * 60 + minutos;
}

function recolectarDatosFormulario() {
  const clave = estado.regiones.claveFormulario;
  if (clave === "veterinarias") {
    const campos = estado.regiones.camposVeterinaria;
    const latitud = campos.latitud.value.trim();
    const longitud = campos.longitud.value.trim();
    if ((latitud && !longitud) || (!latitud && longitud)) throw new Error("Completa latitud y longitud para guardar la ubicación.");
    const etiquetas = campos.etiquetas.value.split(",").map((etiqueta) => etiqueta.trim()).filter(Boolean);
    return {
      nombre: campos.nombre.value.trim(),
      direccion: campos.direccion.value.trim() || null,
      ciudad: campos.ciudad.value.trim() || null,
      pais: campos.pais.value.trim().toUpperCase() || null,
      telefono: campos.telefono.value.trim() || null,
      correo: campos.correo.value.trim() || null,
      latitud: latitud ? Number(latitud) : null,
      longitud: longitud ? Number(longitud) : null,
      etiquetas,
      activa: campos.activa.checked,
      horarios: recolectarHorarios()
    };
  }
  if (clave === "vacunas") {
    const campos = estado.regiones.camposVacuna;
    const valorEspecie = campos.especie.value;
    if (!valorEspecie) throw new Error("Selecciona perro, gato o ambas especies.");
    const intervalo = campos.intervalo.value.trim();
    if (intervalo && (!Number.isInteger(Number(intervalo)) || Number(intervalo) < 1 || Number(intervalo) > 65535)) throw new Error("El intervalo de refuerzo debe ser un número entero entre 1 y 65535 días.");
    return {
      nombre: campos.nombre.value.trim(),
      especie_id: valorEspecie === "__ambas__" ? null : Number(valorEspecie),
      intervalo_refuerzo_dias: intervalo ? Number(intervalo) : null,
      descripcion: campos.descripcion.value.trim() || null,
      activa: campos.activa.checked
    };
  }
  const campos = estado.regiones.camposMotivo;
  return { nombre: campos.nombre.value.trim(), activo: campos.activo.checked };
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  if (estado.guardando) return;
  const formulario = estado.regiones.formulario;
  if (!formulario.reportValidity()) return;
  let datos;
  try {
    datos = recolectarDatosFormulario();
  } catch (error) {
    mostrarErrorDialogo(error.message || "Revisa los datos del formulario.");
    return;
  }
  estado.guardando = true;
  estado.regiones.guardar.disabled = true;
  estado.regiones.guardar.textContent = "Guardando…";
  estado.regiones.errorDialogo.hidden = true;
  const clave = estado.regiones.claveFormulario;
  const config = CATALOGOS[clave];
  const esEdicion = Boolean(estado.registroEditando);
  try {
    if (esEdicion) await api.admin.actualizarCatalogo(config.recurso, estado.registroEditando.id, datos);
    else await api.admin.crearCatalogo(config.recurso, datos);
    cerrarDialogo(true);
    const recargado = await cargarCatalogo(clave, { silencioso: true });
    mostrarToast(recargado
      ? (esEdicion ? "Registro actualizado correctamente." : "Registro creado correctamente.")
      : "El registro se guardó, pero no se pudo recargar el catálogo.", recargado ? "exito" : "error");
  } catch (error) {
    mostrarErrorDialogo(mensajeError(error, "No fue posible guardar el registro."));
  } finally {
    estado.guardando = false;
    if (estado.regiones.guardar) {
      estado.regiones.guardar.disabled = false;
      estado.regiones.guardar.textContent = "Guardar";
    }
  }
}

function mostrarErrorDialogo(mensaje) {
  estado.regiones.errorDialogo.textContent = mensaje;
  estado.regiones.errorDialogo.hidden = false;
}

function cerrarDialogo(forzar = false) {
  if (estado.guardando && !forzar) return;
  if (typeof estado.dialogo.close === "function" && estado.dialogo.open) estado.dialogo.close();
  else estado.dialogo.removeAttribute("open");
  estado.dialogo.replaceChildren();
  estado.registroEditando = null;
  estado.regiones.claveFormulario = null;
  estado.regiones.guardar = null;
}

async function cargarDatosIniciales() {
  await Promise.allSettled([asegurarEspecies(), cargarCatalogo("veterinarias")]);
}

/** Abre la página solo a administradores; FastAPI debe repetir la autorización en cada endpoint. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    const sesion = await protegerPagina({ roles: ["administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!sesion) return;
    estado.sesion = sesion;
    estado.layout = montarLayout({ contenedor, sesion, titulo: "Catálogos", paginaActual: window.location.pathname });
    construirPagina(estado.layout.contenido);
    contenedor.setAttribute("aria-busy", "false");
    await cargarDatosIniciales();
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    const bloque = crearEstadoVacio("No pudimos abrir los catálogos", mensajeError(error, "Ocurrió un error al preparar la sección administrativa."));
    bloque.classList.add("admin-catalogos__estado--error");
    contenedor.replaceChildren(bloque);
  }
}

iniciar();
