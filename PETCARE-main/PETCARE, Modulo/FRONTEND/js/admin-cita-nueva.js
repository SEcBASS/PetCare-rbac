/** Formulario administrativo para agendar citas con usuarios, mascotas y horas disponibles reales. */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { debounce, formatearFecha, formatearHora, textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html", citas: "/admin-citas.html" };
const estado = {
  sesion: null, layout: null, usuario: null, usuariosEncontrados: [], mascotas: [], veterinarias: [], motivos: [],
  horasDisponibles: [], cargandoMascotas: false, cargandoHoras: false,
  enviando: false, secuenciaUsuarios: 0, secuenciaMascotas: 0, secuenciaHoras: 0, regiones: null
};

/** Devuelve la fecha local actual como AAAA-MM-DD sin desplazamiento UTC. */
function fechaLocalISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

/** Crea nodos y coloca cualquier dato remoto como texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un símbolo SVG sencillo con trazos definidos localmente. */
function crearIcono(nombre) {
  const trazos = {
    calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
    usuario: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
    mascota: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"]
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "22"); svg.setAttribute("height", "22");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  for (const d of trazos[nombre] || []) { const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", d); svg.append(path); }
  return svg;
}

/** Extrae la colección entregada por la API sin insertar registros locales. */
function obtenerDatos(respuesta) { return Array.isArray(respuesta) ? respuesta : Array.isArray(respuesta?.datos) ? respuesta.datos : []; }

/** Convierte errores HTTP al mensaje público del contrato { error, campos }. */
function mensajeError(error, alternativo) { return error instanceof ApiError ? error.error || error.message : error?.message || alternativo; }

/** Añade al aviso general los mensajes de campos que entregue FastAPI. */
function mensajeErrorCompleto(error, alternativo) {
  const principal = mensajeError(error, alternativo);
  const campos = error instanceof ApiError ? error.campos : error?.campos;
  if (!campos || typeof campos !== "object") return principal;
  const detalles = Object.entries(campos).flatMap(([campo, valor]) => {
    const mensajes = Array.isArray(valor) ? valor : [valor];
    return mensajes.map((mensaje) => `${campo}: ${typeof mensaje === "string" ? mensaje : mensaje?.mensaje || "Revisa este campo."}`);
  });
  return detalles.length ? `${principal} ${detalles.join(" ")}` : principal;
}

/** Devuelve un control etiquetado con su estructura accesible. */
function crearCampo(etiquetaTexto, id, tipo = "select", atributos = {}) {
  const grupo = crearElemento("div", { clase: "admin-cita__campo" });
  const etiqueta = crearElemento("label", { texto: etiquetaTexto, atributos: { for: id } });
  const control = crearElemento(tipo, { atributos: { id, name: id, ...atributos } });
  grupo.append(etiqueta, control);
  return { grupo, etiqueta, control };
}

/** Crea el formulario ordenado y el resumen lateral que se actualiza en vivo. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "admin-cita" });
  const intro = crearElemento("header", { clase: "admin-cita__intro" });
  const sobrelinea = crearElemento("p", { clase: "admin-cita__sobrelinea" });
  sobrelinea.append(crearIcono("calendario"), document.createTextNode("Agenda veterinaria"));
  intro.append(sobrelinea, crearElemento("h2", { texto: "Agendar cita" }),
    crearElemento("p", { texto: "Selecciona al usuario, su mascota y un horario disponible para registrar la cita." }));

  const rejilla = crearElemento("div", { clase: "admin-cita__rejilla" });
  const formulario = crearElemento("form", { clase: "admin-cita__formulario", atributos: { novalidate: "" } });
  const campoUsuario = crearCampo("Usuario", "admin-cita-usuario", "input", { type: "search", placeholder: "Busca por nombre o correo…", autocomplete: "off", required: "", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "admin-cita-usuarios-resultados" });
  campoUsuario.grupo.classList.add("admin-cita__buscador");
  const listaUsuarios = crearElemento("div", { clase: "admin-cita__sugerencias", atributos: { id: "admin-cita-usuarios-resultados", role: "listbox", hidden: "" } });
  campoUsuario.grupo.append(listaUsuarios);
  const usuarioSeleccionado = crearElemento("div", { clase: "admin-cita__usuario-seleccionado", atributos: { hidden: "", "aria-live": "polite" } });
  formulario.append(campoUsuario.grupo, usuarioSeleccionado);

  const campoMascota = crearCampo("Mascota", "admin-cita-mascota", "select", { required: "", disabled: "" });
  campoMascota.control.append(crearElemento("option", { texto: "Primero selecciona un usuario", atributos: { value: "" } }));
  campoMascota.grupo.append(crearElemento("small", { clase: "admin-cita__ayuda", texto: "Solo aparecen mascotas activas del usuario seleccionado." }));
  formulario.append(campoMascota.grupo);

  const campoVeterinaria = crearCampo("Veterinaria", "admin-cita-veterinaria", "select", { required: "" });
  campoVeterinaria.control.append(crearElemento("option", { texto: "Cargando veterinarias…", atributos: { value: "" } }));
  formulario.append(campoVeterinaria.grupo);

  const campoFecha = crearCampo("Fecha", "admin-cita-fecha", "input", { type: "date", min: fechaLocalISO(), required: "" });
  formulario.append(campoFecha.grupo);

  const campoHora = crearCampo("Hora disponible", "admin-cita-hora", "select", { required: "", disabled: "" });
  campoHora.control.append(crearElemento("option", { texto: "Selecciona veterinaria y fecha", atributos: { value: "" } }));
  const estadoHoras = crearElemento("p", { clase: "admin-cita__estado-horas", atributos: { role: "status", "aria-live": "polite" } });
  estadoHoras.textContent = "Las horas se consultan al servidor cuando eliges veterinaria y fecha.";
  campoHora.grupo.append(estadoHoras);
  formulario.append(campoHora.grupo);

  const campoMotivo = crearCampo("Motivo de consulta", "admin-cita-motivo", "select", { required: "" });
  campoMotivo.control.append(crearElemento("option", { texto: "Cargando motivos…", atributos: { value: "" } }));
  formulario.append(campoMotivo.grupo);

  const campoNotas = crearCampo("Notas adicionales", "admin-cita-notas", "textarea", { maxlength: "2000", rows: "4", placeholder: "Información adicional relevante para la cita…" });
  formulario.append(campoNotas.grupo);

  const error = crearElemento("p", { clase: "admin-cita__error", atributos: { role: "alert", hidden: "" } });
  formulario.append(error);
  const acciones = crearElemento("div", { clase: "admin-cita__acciones" });
  const cancelar = crearElemento("a", { clase: "boton boton--secundario", texto: "Cancelar", atributos: { href: RUTAS.citas } });
  const confirmar = crearElemento("button", { clase: "boton", texto: "Confirmar cita", atributos: { type: "submit" } });
  acciones.append(cancelar, confirmar); formulario.append(acciones);

  const resumen = crearElemento("aside", { clase: "admin-cita__resumen", atributos: { "aria-labelledby": "admin-cita-resumen-titulo" } });
  const resumenCabecera = crearElemento("header", { clase: "admin-cita__resumen-cabecera" });
  resumenCabecera.append(crearElemento("span", { texto: "Vista previa" }), crearElemento("h3", { texto: "Resumen de cita", atributos: { id: "admin-cita-resumen-titulo" } }));
  const resumenContenido = crearElemento("div", { clase: "admin-cita__resumen-contenido" });
  const resumenVacio = crearElemento("p", { clase: "admin-cita__resumen-vacio", texto: "Completa el formulario para revisar los datos de la cita antes de confirmarla." });
  const resumenPie = crearElemento("p", { clase: "admin-cita__resumen-pie", texto: "La cita quedará registrada como pendiente. El servidor valida nuevamente que el horario continúe disponible." });
  resumen.append(resumenCabecera, resumenContenido, resumenVacio, resumenPie);
  rejilla.append(formulario, resumen); pagina.append(intro, rejilla); contenedor.replaceChildren(pagina);

  estado.regiones = { formulario, campoUsuario: campoUsuario.control, listaUsuarios, usuarioSeleccionado,
    campoMascota: campoMascota.control, campoVeterinaria: campoVeterinaria.control, campoFecha: campoFecha.control,
    campoHora: campoHora.control, estadoHoras, campoMotivo: campoMotivo.control, campoNotas: campoNotas.control,
    error, confirmar, resumenContenido, resumenVacio };

  const buscar = debounce((valor) => buscarUsuarios(valor), 280);
  campoUsuario.control.addEventListener("input", () => {
    estado.usuario = null;
    usuarioSeleccionado.hidden = true;
    limpiarMascotas();
    campoUsuario.control.setAttribute("aria-expanded", "true");
    buscar(campoUsuario.control.value.trim());
    actualizarResumen();
  });
  campoUsuario.control.addEventListener("keydown", (evento) => { if (evento.key === "Escape") cerrarSugerencias(); });
  campoVeterinaria.control.addEventListener("change", () => { limpiarHoras("Consulta las horas disponibles para esta veterinaria y fecha."); actualizarResumen(); cargarDisponibilidad(); });
  campoFecha.control.addEventListener("change", () => { limpiarHoras("Consulta las horas disponibles para esta fecha."); actualizarResumen(); cargarDisponibilidad(); });
  campoMascota.control.addEventListener("change", actualizarResumen);
  campoHora.control.addEventListener("change", actualizarResumen);
  campoMotivo.control.addEventListener("change", actualizarResumen);
  campoNotas.control.addEventListener("input", actualizarResumen);
  formulario.addEventListener("submit", enviarFormulario);
  return estado.regiones;
}

/** Busca cuentas mediante el catálogo paginado de administración. */
async function buscarUsuarios(termino) {
  const secuencia = ++estado.secuenciaUsuarios;
  const lista = estado.regiones.listaUsuarios; lista.replaceChildren();
  if (!termino) { cerrarSugerencias(); return; }
  lista.hidden = false; lista.append(crearElemento("p", { clase: "admin-cita__sugerencia", texto: "Buscando usuarios…", atributos: { role: "status" } }));
  try {
    const respuesta = await api.admin.listarUsuarios({ q: termino, pagina: 1 });
    if (secuencia !== estado.secuenciaUsuarios) return;
    const usuarios = obtenerDatos(respuesta); lista.replaceChildren();
    if (!usuarios.length) { lista.append(crearElemento("p", { clase: "admin-cita__sugerencia", texto: "No encontramos usuarios con esa búsqueda." })); return; }
    for (const usuario of usuarios) {
      const boton = crearElemento("button", { clase: "admin-cita__sugerencia", atributos: { type: "button", role: "option" } });
      boton.append(crearElemento("strong", { texto: usuario.nombre_completo || "Nombre no disponible" }),
        crearElemento("small", { texto: usuario.correo || "Correo no disponible" }));
      boton.addEventListener("click", () => seleccionarUsuario(usuario)); lista.append(boton);
    }
  } catch (error) {
    if (secuencia !== estado.secuenciaUsuarios) return;
    lista.replaceChildren(crearElemento("p", { clase: "admin-cita__sugerencia", texto: mensajeError(error, "No fue posible buscar usuarios.") }));
  }
}

/** Cierra la lista de sugerencias y sincroniza el estado ARIA del campo de búsqueda. */
function cerrarSugerencias() {
  estado.regiones.listaUsuarios.hidden = true;
  estado.regiones.campoUsuario.setAttribute("aria-expanded", "false");
}

/** Selecciona una cuenta real y solicita exclusivamente sus mascotas. */
async function seleccionarUsuario(usuario) {
  estado.usuario = usuario; cerrarSugerencias();
  estado.regiones.campoUsuario.value = usuario.nombre_completo || usuario.correo || "";
  estado.regiones.usuarioSeleccionado.replaceChildren();
  const texto = crearElemento("div");
  texto.append(crearElemento("strong", { texto: usuario.nombre_completo || "Usuario" }),
    crearElemento("small", { texto: usuario.correo || "Correo no disponible" }));
  const quitar = crearElemento("button", { clase: "admin-cita__quitar", texto: "Cambiar", atributos: { type: "button" } });
  quitar.addEventListener("click", () => { estado.usuario = null; estado.regiones.campoUsuario.value = ""; estado.regiones.usuarioSeleccionado.hidden = true; limpiarMascotas(); estado.regiones.campoUsuario.focus(); actualizarResumen(); });
  estado.regiones.usuarioSeleccionado.append(texto, quitar); estado.regiones.usuarioSeleccionado.hidden = false;
  await cargarMascotasUsuario(usuario.id); actualizarResumen();
}

/** Limpia el selector de mascota cuando se cambia el usuario. */
function limpiarMascotas() {
  estado.secuenciaMascotas += 1; estado.mascotas = [];
  const select = estado.regiones.campoMascota; select.disabled = true;
  select.replaceChildren(crearElemento("option", { texto: "Primero selecciona un usuario", atributos: { value: "" } }));
}

/** Obtiene mascotas desde el endpoint administrativo asociado a la cuenta escogida. */
async function cargarMascotasUsuario(usuarioId) {
  const secuencia = ++estado.secuenciaMascotas;
  estado.cargandoMascotas = true;
  const select = estado.regiones.campoMascota; select.disabled = true;
  select.replaceChildren(crearElemento("option", { texto: "Consultando mascotas…", atributos: { value: "" } }));
  try {
    const respuesta = await api.admin.obtenerMascotasUsuario(usuarioId);
    if (secuencia !== estado.secuenciaMascotas) return;
    const recibidas = obtenerDatos(respuesta);
    estado.mascotas = recibidas.filter((mascota) => mascota.activa === undefined || mascota.activa === null || mascota.activa === true || Number(mascota.activa) === 1);
    select.replaceChildren(crearElemento("option", { texto: estado.mascotas.length ? "Selecciona una mascota" : "Este usuario no tiene mascotas activas", atributos: { value: "" } }));
    for (const mascota of estado.mascotas) {
      const detalles = [mascota.nombre_especie, mascota.nombre_raza].filter(Boolean).join(" · ");
      select.append(crearElemento("option", { texto: detalles ? `${mascota.nombre} · ${detalles}` : mascota.nombre || "Mascota", atributos: { value: mascota.id } }));
    }
    select.disabled = !estado.mascotas.length;
  } catch (error) {
    if (secuencia !== estado.secuenciaMascotas) return;
    estado.mascotas = [];
    select.replaceChildren(crearElemento("option", { texto: mensajeError(error, "No se pudieron cargar las mascotas"), atributos: { value: "" } }));
    select.disabled = true;
  } finally {
    if (secuencia === estado.secuenciaMascotas) estado.cargandoMascotas = false;
  }
}

/** Carga veterinarias y motivos reales de sus respectivos catálogos. */
async function cargarCatalogos() {
  const [resultadoVeterinarias, resultadoMotivos] = await Promise.allSettled([
    api.admin.listarCatalogo("veterinarias"), api.admin.listarCatalogo("motivos-consulta")
  ]);
  const vet = estado.regiones.campoVeterinaria; vet.replaceChildren(crearElemento("option", { texto: "Selecciona una veterinaria", atributos: { value: "" } }));
  if (resultadoVeterinarias.status === "fulfilled") {
    estado.veterinarias = obtenerDatos(resultadoVeterinarias.value).filter((registro) => registro.activa === undefined || registro.activa === null || registro.activa === true || Number(registro.activa) === 1);
    for (const veterinaria of estado.veterinarias) vet.append(crearElemento("option", { texto: veterinaria.nombre || "Veterinaria", atributos: { value: veterinaria.id } }));
  } else { vet.disabled = true; mostrarError(mensajeError(resultadoVeterinarias.reason, "No fue posible cargar las veterinarias.")); }

  const motivo = estado.regiones.campoMotivo; motivo.replaceChildren(crearElemento("option", { texto: "Selecciona el motivo de consulta", atributos: { value: "" } }));
  if (resultadoMotivos.status === "fulfilled") {
    estado.motivos = obtenerDatos(resultadoMotivos.value).filter((registro) => registro.activo === undefined || registro.activo === null || registro.activo === true || Number(registro.activo) === 1);
    for (const registro of estado.motivos) motivo.append(crearElemento("option", { texto: registro.nombre || "Motivo", atributos: { value: registro.id } }));
  } else { motivo.disabled = true; mostrarError(mensajeError(resultadoMotivos.reason, "No fue posible cargar los motivos de consulta.")); }
}

/** Limpia las horas antiguas cada vez que cambian la veterinaria o la fecha. */
function limpiarHoras(mensaje) {
  estado.secuenciaHoras += 1; estado.horasDisponibles = [];
  const select = estado.regiones.campoHora; select.disabled = true;
  select.replaceChildren(crearElemento("option", { texto: "Selecciona veterinaria y fecha", atributos: { value: "" } }));
  const aviso = estado.regiones.estadoHoras; aviso.textContent = mensaje; aviso.className = "admin-cita__estado-horas";
}

/** Solicita al backend los espacios libres calculados desde HORARIOS_VETERINARIA y CITAS. */
async function cargarDisponibilidad() {
  const veterinariaId = estado.regiones.campoVeterinaria.value;
  const fecha = estado.regiones.campoFecha.value;
  if (!veterinariaId || !fecha) return;
  const secuencia = ++estado.secuenciaHoras;
  estado.cargandoHoras = true;
  const select = estado.regiones.campoHora; select.disabled = true;
  select.replaceChildren(crearElemento("option", { texto: "Consultando horas…", atributos: { value: "" } }));
  const aviso = estado.regiones.estadoHoras; aviso.textContent = "Consultando disponibilidad…"; aviso.className = "admin-cita__estado-horas";
  try {
    const respuesta = await api.admin.obtenerDisponibilidad({ veterinaria_id: veterinariaId, fecha });
    if (secuencia !== estado.secuenciaHoras) return;
    const lista = Array.isArray(respuesta?.horas_disponibles) ? respuesta.horas_disponibles : obtenerDatos(respuesta);
    estado.horasDisponibles = lista.map((elemento) => typeof elemento === "string" ? elemento : elemento?.hora_cita || elemento?.hora).filter(Boolean);
    select.replaceChildren(crearElemento("option", { texto: estado.horasDisponibles.length ? "Selecciona una hora disponible" : "No hay horas disponibles", atributos: { value: "" } }));
    for (const hora of estado.horasDisponibles) select.append(crearElemento("option", { texto: formatearHora(hora), atributos: { value: hora } }));
    select.disabled = !estado.horasDisponibles.length;
    aviso.textContent = estado.horasDisponibles.length ? `${estado.horasDisponibles.length} horarios disponibles.` : "No hay espacios libres para esa fecha. Prueba otro día.";
    aviso.className = `admin-cita__estado-horas${estado.horasDisponibles.length ? " admin-cita__estado-horas--exito" : ""}`;
  } catch (error) {
    if (secuencia !== estado.secuenciaHoras) return;
    estado.horasDisponibles = []; select.replaceChildren(crearElemento("option", { texto: "No se pudo consultar la disponibilidad", atributos: { value: "" } }));
    aviso.textContent = mensajeError(error, "No fue posible consultar las horas disponibles."); aviso.className = "admin-cita__estado-horas admin-cita__estado-horas--error";
  } finally {
    if (secuencia === estado.secuenciaHoras) estado.cargandoHoras = false;
  }
}

/** Actualiza el resumen con los valores seleccionados, sin completar campos que falten. */
function actualizarResumen() {
  const regiones = estado.regiones; if (!regiones) return;
  const mascota = estado.mascotas.find((item) => String(item.id) === regiones.campoMascota.value);
  const veterinaria = estado.veterinarias.find((item) => String(item.id) === regiones.campoVeterinaria.value);
  const motivo = estado.motivos.find((item) => String(item.id) === regiones.campoMotivo.value);
  const valores = [
    ["Usuario", estado.usuario?.nombre_completo || "Pendiente de selección"],
    ["Mascota", mascota?.nombre || "Pendiente de selección"],
    ["Veterinaria", veterinaria?.nombre || "Pendiente de selección"],
    ["Fecha", regiones.campoFecha.value ? formatearFecha(regiones.campoFecha.value) : "Pendiente de selección"],
    ["Hora", regiones.campoHora.value ? formatearHora(regiones.campoHora.value) : "Pendiente de disponibilidad"],
    ["Motivo", motivo?.nombre || "Pendiente de selección"]
  ];
  regiones.resumenContenido.replaceChildren();
  for (const [etiqueta, valor] of valores) {
    const fila = crearElemento("div", { clase: "admin-cita__resumen-fila" });
    fila.append(crearElemento("span", { texto: etiqueta }), crearElemento("strong", { texto: valor }));
    regiones.resumenContenido.append(fila);
  }
  const notas = regiones.campoNotas.value.trim();
  if (notas) {
    const fila = crearElemento("div", { clase: "admin-cita__resumen-fila" });
    fila.append(crearElemento("span", { texto: "Notas" }), crearElemento("strong", { texto: notas })); regiones.resumenContenido.append(fila);
  }
  regiones.resumenVacio.hidden = Boolean(estado.usuario || mascota || veterinaria || motivo || regiones.campoFecha.value || regiones.campoHora.value || notas);
}

/** Muestra un error general del formulario sin interpretar respuesta del servidor como HTML. */
function mostrarError(mensaje) { const error = estado.regiones.error; error.textContent = mensaje; error.hidden = false; }

/** Valida campos visibles, confirma que la hora fue ofrecida y crea la cita sin enviar creado_por_id. */
async function enviarFormulario(evento) {
  evento.preventDefault();
  const regiones = estado.regiones;
  regiones.error.hidden = true; regiones.error.textContent = "";
  if (estado.enviando) return;
  if (!regiones.formulario.reportValidity()) return;
  const mascota = estado.mascotas.find((item) => String(item.id) === regiones.campoMascota.value);
  if (!estado.usuario || !mascota) { mostrarError("Selecciona un usuario y una de sus mascotas activas."); return; }
  const hora = regiones.campoHora.value;
  if (!estado.horasDisponibles.includes(hora)) { mostrarError("Selecciona una hora que el servidor haya devuelto como disponible."); await cargarDisponibilidad(); return; }
  const datos = {
    mascota_id: mascota.id,
    veterinaria_id: Number(regiones.campoVeterinaria.value),
    fecha_cita: regiones.campoFecha.value,
    hora_cita: hora,
    motivo_id: Number(regiones.campoMotivo.value),
    notas: regiones.campoNotas.value.trim() || null,
    estado: "pendiente"
  };
  estado.enviando = true; regiones.confirmar.disabled = true; regiones.confirmar.textContent = "Confirmando…";
  try {
    const respuesta = await api.admin.agendarCita(datos);
    const cita = respuesta?.cita;
    const destino = new URL(RUTAS.citas, window.location.origin);
    if (cita?.id) destino.searchParams.set("cita_id", cita.id);
    destino.searchParams.set("creada", "1");
    window.location.assign(destino.href);
  } catch (error) {
    const detalle = mensajeError(error, "No fue posible registrar la cita.");
    if (error?.status === 409 || /horario|disponib|ocupad/i.test(detalle)) {
      mostrarError("Ese horario acaba de ocuparse. Consulta nuevamente los horarios disponibles y selecciona otro.");
      await cargarDisponibilidad();
    } else {
      mostrarError(mensajeErrorCompleto(error, detalle));
    }
  } finally {
    estado.enviando = false; regiones.confirmar.disabled = false; regiones.confirmar.textContent = "Confirmar cita";
  }
}

/** Precarga el usuario si el formulario se abre desde el detalle administrativo de una cuenta. */
async function precargarUsuarioDesdeUrl() {
  const usuarioId = new URLSearchParams(window.location.search).get("usuario_id");
  if (!usuarioId) return;
  try {
    const respuesta = await api.admin.obtenerUsuario(usuarioId);
    const usuario = respuesta?.usuario || respuesta;
    if (usuario?.id) await seleccionarUsuario(usuario);
    else mostrarError("No se pudo identificar el usuario del enlace. Búscalo manualmente.");
  } catch (error) {
    mostrarError(mensajeError(error, "No fue posible precargar el usuario del enlace. Puedes buscarlo manualmente."));
  }
}

/** Protege el acceso administrativo y monta los recursos compartidos. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!estado.sesion) return;
    estado.layout = montarLayout({ contenedor, sesion: estado.sesion, titulo: "Agendar cita", paginaActual: "/admin-citas.html" });
    construirPagina(estado.layout.contenido);
    contenedor.setAttribute("aria-busy", "false");
    await Promise.all([cargarCatalogos(), precargarUsuarioDesdeUrl()]);
    actualizarResumen();
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    const panel = crearElemento("section", { clase: "admin-cita__error" });
    panel.append(crearElemento("h1", { texto: "No pudimos abrir el agendamiento" }),
      crearElemento("p", { texto: mensajeError(error, "Ocurrió un error al validar la sesión o preparar el formulario.") }));
    const reintentar = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
    reintentar.addEventListener("click", () => window.location.reload()); panel.append(reintentar); contenedor.replaceChildren(panel);
  }
}

iniciar();
