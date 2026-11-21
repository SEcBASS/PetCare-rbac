/**
 * Carnet de vacunación administrativo de PetCare.
 * El navegador consulta catálogos y envía cambios mediante js/api.js; la autorización,
 * validación de relaciones y auditoría de quién registra corresponden siempre a FastAPI.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { debounce, formatearFecha, textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html" };
const estado = {
  sesion: null,
  layout: null,
  usuario: null,
  usuariosEncontrados: [],
  mascotas: [],
  mascota: null,
  vacunas: [],
  veterinarias: [],
  veterinarios: [],
  citas: [],
  cargandoCarnet: false,
  guardando: false,
  eliminandoId: null,
  secuenciaUsuarios: 0,
  secuenciaMascotas: 0,
  secuenciaCarnet: 0,
  secuenciaCatalogos: 0,
  regiones: null,
  parametrosIniciales: null
};

const ESTADOS = {
  al_dia: { etiqueta: "Al día", clase: "admin-vacunas-estado" },
  proxima: { etiqueta: "Próxima", clase: "admin-vacunas-estado admin-vacunas-estado--proxima" },
  vencida: { etiqueta: "Pendiente", clase: "admin-vacunas-estado admin-vacunas-estado--pendiente" },
  pendiente: { etiqueta: "Pendiente", clase: "admin-vacunas-estado admin-vacunas-estado--pendiente" }
};

/** Crea un nodo y coloca cualquier dato remoto como texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null && valor !== false) nodo.setAttribute(nombre, String(valor));
    else if (valor === false) nodo.removeAttribute(nombre);
  }
  return nodo;
}

/** Extrae los elementos de una colección sin construir datos locales de ejemplo. */
function obtenerDatos(respuesta, claves = ["datos", "vacunas", "mascotas", "usuarios", "citas"]) {
  if (Array.isArray(respuesta)) return respuesta;
  for (const clave of claves) if (Array.isArray(respuesta?.[clave])) return respuesta[clave];
  return [];
}

/** Normaliza el mensaje principal y los errores por campo del contrato { error, campos }. */
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

/** Formatea un valor DATE de MySQL como fecha local, sin convertirlo a UTC. */
function fechaLegible(valor) {
  if (!valor) return "No registrada";
  const partes = String(valor).slice(0, 10).split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isFinite(parte))) return "No registrada";
  const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  return Number.isNaN(fecha.getTime()) ? "No registrada" : new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(fecha);
}

/** Devuelve la fecha local actual como AAAA-MM-DD. */
function fechaLocalISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

/** Normaliza banderas de MySQL que pueden llegar como booleano o número. */
function estaActivo(registro) {
  return registro?.activa === undefined && registro?.activo === undefined
    ? true
    : registro.activa === true || registro.activo === true || Number(registro.activa ?? registro.activo) === 1;
}

/** Construye un campo con etiqueta accesible. */
function crearCampo(etiqueta, id, tipo = "select", atributos = {}) {
  const grupo = crearElemento("div", { clase: "campo" });
  const label = crearElemento("label", { texto: etiqueta, atributos: { for: id } });
  const control = crearElemento(tipo, { atributos: { id, name: id, ...atributos } });
  grupo.append(label, control);
  return { grupo, control };
}

/**
 * Construye el panel, filtros de usuario/mascota, contadores, tabla y diálogo de registro.
 * La estructura se dibuja con nodos para mantener seguros los textos procedentes del servidor.
 */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "admin-vacunas-pagina" });
  const intro = crearElemento("header", { clase: "admin-vacunas-intro" });
  const introTexto = crearElemento("div");
  introTexto.append(
    crearElemento("p", { clase: "admin-vacunas-sobrelinea", texto: "Administración · Salud preventiva" }),
    crearElemento("h2", { texto: "Carnet de vacunas" }),
    crearElemento("p", { texto: "Consulta y administra el historial de vacunación de las mascotas." })
  );
  intro.append(introTexto);

  const filtros = crearElemento("section", { clase: "admin-vacunas-filtros", atributos: { "aria-label": "Seleccionar usuario y mascota" } });
  const campoUsuario = crearCampo("Usuario", "admin-vacunas-usuario", "input", {
    type: "search", placeholder: "Buscar por nombre o correo…", autocomplete: "off", role: "combobox",
    "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "admin-vacunas-usuarios-resultados"
  });
  campoUsuario.grupo.append(crearElemento("div", { clase: "admin-vacunas-resultados", atributos: { id: "admin-vacunas-usuarios-resultados", role: "listbox", hidden: "" } }));
  const seleccionado = crearElemento("div", { clase: "admin-vacunas-seleccion-usuario", atributos: { hidden: "", "aria-live": "polite" } });
  campoUsuario.grupo.append(seleccionado);
  const campoMascota = crearCampo("Mascota", "admin-vacunas-mascota", "select", { disabled: "", required: "" });
  campoMascota.control.append(crearElemento("option", { texto: "Primero selecciona un usuario", atributos: { value: "" } }));
  filtros.append(campoUsuario.grupo, campoMascota.grupo);

  const bloqueo = crearElemento("section", { clase: "admin-vacunas-bloqueo", texto: "Selecciona un usuario y una mascota para consultar su carnet." });
  const resumen = crearElemento("section", { clase: "admin-vacunas-resumen", atributos: { "aria-label": "Resumen de vacunación", "aria-live": "polite" } });
  const contadores = crearContadores();
  resumen.append(contadores.alDia, contadores.proximas, contadores.pendientes);

  const carnet = crearElemento("section", { clase: "admin-vacunas-carnet", atributos: { "aria-labelledby": "admin-vacunas-carnet-titulo" } });
  const carnetCabecera = crearElemento("header", { clase: "admin-vacunas-carnet__cabecera" });
  const carnetTitulos = crearElemento("div");
  carnetTitulos.append(crearElemento("h3", { texto: "Historial de vacunación", atributos: { id: "admin-vacunas-carnet-titulo" } }),
    crearElemento("p", { texto: "Selecciona una mascota para consultar, registrar o actualizar sus aplicaciones." }));
  const botonNueva = crearElemento("button", { clase: "admin-vacunas-boton", texto: "+ Registrar vacuna", atributos: { type: "button", disabled: "" } });
  carnetCabecera.append(carnetTitulos, botonNueva);
  const contenido = crearElemento("div", { atributos: { id: "admin-vacunas-contenido", "aria-live": "polite" } });
  contenido.append(crearEstado("Selecciona una mascota", "El carnet aparecerá aquí cuando elijas un usuario y una mascota."));
  carnet.append(carnetCabecera, contenido);

  const dialogo = crearElemento("dialog", { clase: "admin-vacunas-dialogo", atributos: { "aria-labelledby": "admin-vacunas-dialogo-titulo" } });
  const dialogoCabecera = crearElemento("header", { clase: "admin-vacunas-dialogo__cabecera" });
  const dialogoTitulo = crearElemento("div");
  dialogoTitulo.append(crearElemento("h3", { texto: "Registrar vacuna", atributos: { id: "admin-vacunas-dialogo-titulo" } }),
    crearElemento("p", { texto: "Registra la aplicación en el carnet de la mascota seleccionada." }));
  const cerrar = crearElemento("button", { clase: "admin-vacunas-dialogo__cerrar", texto: "×", atributos: { type: "button", "aria-label": "Cerrar formulario" } });
  dialogoCabecera.append(dialogoTitulo, cerrar);

  const formulario = crearElemento("form", { atributos: { novalidate: "" } });
  const grid = crearElemento("div", { clase: "admin-vacunas-form-grid" });
  const campoVacuna = crearCampo("Vacuna", "admin-vacunas-vacuna", "select", { required: "", disabled: "" });
  const campoAplicacion = crearCampo("Fecha de aplicación", "admin-vacunas-aplicacion", "input", { type: "date", required: "", max: fechaLocalISO() });
  const campoProxima = crearCampo("Próxima dosis (opcional)", "admin-vacunas-proxima", "input", { type: "date" });
  const campoVeterinaria = crearCampo("Veterinaria", "admin-vacunas-veterinaria", "select");
  const campoVeterinario = crearCampo("Nombre del veterinario", "admin-vacunas-veterinario", "input", { type: "text", maxlength: "120", list: "admin-vacunas-veterinarios-lista", autocomplete: "off" });
  const listaVeterinarios = crearElemento("datalist", { atributos: { id: "admin-vacunas-veterinarios-lista" } });
  campoVeterinario.control.after(listaVeterinarios);
  const campoLote = crearCampo("Lote", "admin-vacunas-lote", "input", { type: "text", maxlength: "50" });
  const campoCita = crearCampo("Cita asociada (opcional)", "admin-vacunas-cita", "select");
  const campoNotas = crearCampo("Observaciones", "admin-vacunas-notas", "textarea", { maxlength: "255", rows: "3" });
  grid.append(campoVacuna.grupo, campoAplicacion.grupo, campoProxima.grupo, campoVeterinaria.grupo,
    campoVeterinario.grupo, campoLote.grupo, campoCita.grupo);
  formulario.append(grid, campoNotas.grupo);
  const ayudaVeterinario = crearElemento("small", { clase: "admin-vacunas-ayuda", texto: "Puedes escribir el nombre o elegir uno del catálogo de la veterinaria." });
  campoVeterinario.grupo.append(ayudaVeterinario);
  const error = crearElemento("p", { clase: "admin-vacunas-error", atributos: { role: "alert", hidden: "" } });
  const exito = crearElemento("p", { clase: "admin-vacunas-exito", atributos: { role: "status", hidden: "" } });
  const acciones = crearElemento("div", { clase: "admin-vacunas-dialogo__acciones" });
  const cancelar = crearElemento("button", { clase: "admin-vacunas-boton admin-vacunas-boton--secundario", texto: "Cancelar", atributos: { type: "button" } });
  const guardar = crearElemento("button", { clase: "admin-vacunas-boton", texto: "Guardar vacuna", atributos: { type: "submit" } });
  acciones.append(cancelar, guardar);
  formulario.append(error, exito, acciones);
  dialogo.append(dialogoCabecera, formulario);

  pagina.append(intro, filtros, bloqueo, resumen, carnet, dialogo);
  contenedor.replaceChildren(pagina);

  estado.regiones = {
    pagina, campoUsuario: campoUsuario.control, resultadosUsuarios: campoUsuario.grupo.querySelector("#admin-vacunas-usuarios-resultados"),
    seleccionado, campoMascota: campoMascota.control, bloqueo, alDia: contadores.alDia.querySelector("strong"),
    proximas: contadores.proximas.querySelector("strong"), pendientes: contadores.pendientes.querySelector("strong"),
    carnet, contenido, botonNueva, dialogo, formulario, dialogoTitulo: dialogoTitulo.querySelector("h3"),
    campoVacuna: campoVacuna.control, campoAplicacion: campoAplicacion.control, campoProxima: campoProxima.control,
    campoVeterinaria: campoVeterinaria.control, campoVeterinario: campoVeterinario.control, listaVeterinarios,
    campoLote: campoLote.control, campoCita: campoCita.control, campoNotas: campoNotas.control,
    error, exito, guardar
  };

  const buscar = debounce((valor) => buscarUsuarios(valor), 260);
  campoUsuario.control.addEventListener("input", () => {
    estado.secuenciaMascotas += 1;
    estado.secuenciaCarnet += 1;
    estado.secuenciaCatalogos += 1;
    estado.usuario = null;
    seleccionado.hidden = true;
    campoMascota.disabled = true;
    campoMascota.replaceChildren(crearElemento("option", { texto: "Selecciona un usuario", atributos: { value: "" } }));
    estado.mascota = null;
    estado.vacunas = [];
    botonNueva.disabled = true;
    actualizarContadores([]);
    contenido.replaceChildren(crearEstado("Selecciona una mascota", "Elige un usuario y después una de sus mascotas."));
    resultadosUsuarios.hidden = false;
    campoUsuario.control.setAttribute("aria-expanded", "true");
    buscar(campoUsuario.control.value.trim());
  });
  campoUsuario.control.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") { resultadosUsuarios.hidden = true; campoUsuario.control.setAttribute("aria-expanded", "false"); }
  });
  campoMascota.control.addEventListener("change", () => {
    const mascota = estado.mascotas.find((item) => String(item.id) === campoMascota.control.value);
    seleccionarMascota(mascota || null);
  });
  botonNueva.addEventListener("click", () => abrirFormulario());
  cerrar.addEventListener("click", cerrarDialogo);
  cancelar.addEventListener("click", cerrarDialogo);
  dialogo.addEventListener("click", (evento) => { if (evento.target === dialogo) cerrarDialogo(); });
  campoAplicacion.control.addEventListener("change", actualizarLimiteProximaDosis);
  campoVeterinaria.control.addEventListener("change", cargarVeterinarios);
  formulario.addEventListener("submit", guardarFormulario);

  return { pagina };
}

/** Genera los tres contadores sin depender de datos fijos. */
function crearContadores() {
  const crear = (clase, icono, titulo) => {
    const tarjeta = crearElemento("article", { clase: `admin-vacunas-contador ${clase}` });
    const simbolo = crearElemento("span", { clase: "admin-vacunas-contador__icono", texto: icono, atributos: { "aria-hidden": "true" } });
    const bloque = crearElemento("div");
    bloque.append(crearElemento("strong", { texto: "—" }), crearElemento("span", { texto: titulo }));
    tarjeta.append(simbolo, bloque);
    return tarjeta;
  };
  return {
    alDia: crear("", "✓", "Al día"),
    proximas: crear("admin-vacunas-contador--proxima", "◷", "Próximas"),
    pendientes: crear("admin-vacunas-contador--pendiente", "!", "Pendientes")
  };
}

/** Crea un estado de carga, error o ausencia de registros con texto seguro. */
function crearEstado(titulo, descripcion, tipo = "vacio", accion = null) {
  const bloque = crearElemento("div", { clase: `admin-vacunas-estado-pagina admin-vacunas-${tipo}` });
  bloque.append(crearElemento("strong", { texto: titulo }), crearElemento("p", { texto: descripcion }));
  if (accion) {
    const boton = crearElemento("button", { clase: "admin-vacunas-boton admin-vacunas-boton--secundario", texto: accion.texto, atributos: { type: "button" } });
    boton.addEventListener("click", accion.onClick);
    bloque.append(boton);
  }
  return bloque;
}

/** Muestra resultados de búsqueda como botones y conserva solo el ID de la cuenta seleccionada. */
async function buscarUsuarios(termino) {
  const secuencia = ++estado.secuenciaUsuarios;
  const caja = estado.regiones.resultadosUsuarios;
  caja.replaceChildren();
  if (!termino) {
    caja.append(crearElemento("p", { texto: "Escribe un nombre o correo para buscar usuarios." }));
    return;
  }
  caja.append(crearElemento("p", { texto: "Buscando usuarios…", atributos: { role: "status" } }));
  try {
    const respuesta = await api.admin.listarUsuarios({ q: termino, pagina: 1 });
    if (secuencia !== estado.secuenciaUsuarios) return;
    estado.usuariosEncontrados = obtenerDatos(respuesta);
    caja.replaceChildren();
    if (!estado.usuariosEncontrados.length) {
      caja.append(crearElemento("p", { texto: "No encontramos usuarios con esa búsqueda." }));
      return;
    }
    for (const usuario of estado.usuariosEncontrados) {
      const opcion = crearElemento("button", { clase: "admin-vacunas-resultado", atributos: { type: "button", role: "option" } });
      opcion.append(crearElemento("strong", { texto: usuario.nombre_completo || "Nombre no disponible" }),
        crearElemento("small", { texto: usuario.correo || "Correo no disponible" }));
      opcion.addEventListener("click", () => seleccionarUsuario(usuario));
      caja.append(opcion);
    }
  } catch (error) {
    if (secuencia !== estado.secuenciaUsuarios) return;
    caja.replaceChildren(crearElemento("p", { texto: mensajeError(error, "No fue posible buscar usuarios.") }));
  }
}

/** Selecciona una cuenta; las mascotas siempre se consultan desde el endpoint administrativo del dueño. */
async function seleccionarUsuario(usuario, mascotaInicial = null) {
  if (!usuario?.id) return;
  estado.usuario = usuario;
  estado.mascota = null;
  estado.mascotas = [];
  estado.vacunas = [];
  estado.regiones.campoUsuario.value = usuario.nombre_completo || usuario.correo || "";
  estado.regiones.resultadosUsuarios.hidden = true;
  estado.regiones.campoUsuario.setAttribute("aria-expanded", "false");
  estado.regiones.seleccionado.replaceChildren(
    document.createTextNode(`${usuario.nombre_completo || "Usuario"} · ${usuario.correo || "Correo no disponible"} `)
  );
  const quitar = crearElemento("button", { texto: "Cambiar", atributos: { type: "button" } });
  quitar.addEventListener("click", () => {
    estado.usuario = null; estado.mascota = null; estado.mascotas = [];
    estado.regiones.campoUsuario.value = ""; estado.regiones.seleccionado.hidden = true;
    estado.regiones.campoMascota.disabled = true;
    estado.regiones.campoMascota.replaceChildren(crearElemento("option", { texto: "Primero selecciona un usuario", atributos: { value: "" } }));
    estado.regiones.botonNueva.disabled = true;
    actualizarContadores([]);
    estado.regiones.contenido.replaceChildren(crearEstado("Selecciona una mascota", "Elige un usuario y después una de sus mascotas."));
  });
  estado.regiones.seleccionado.append(quitar);
  estado.regiones.seleccionado.hidden = false;
  estado.regiones.bloqueo.textContent = "Cargando las mascotas de la cuenta seleccionada…";
  estado.regiones.campoMascota.disabled = true;
  estado.regiones.campoMascota.replaceChildren(crearElemento("option", { texto: "Cargando mascotas…", atributos: { value: "" } }));
  estado.regiones.botonNueva.disabled = true;
  estado.regiones.contenido.replaceChildren(crearEstado("Cargando mascotas", "Consultando los registros asociados a este usuario.", "cargando"));
  const secuencia = ++estado.secuenciaMascotas;
  try {
    const respuesta = await api.admin.obtenerMascotasUsuario(usuario.id);
    if (secuencia !== estado.secuenciaMascotas) return;
    estado.mascotas = obtenerDatos(respuesta, ["datos", "mascotas"]);
    const select = estado.regiones.campoMascota;
    select.replaceChildren(crearElemento("option", { texto: "Selecciona una mascota", atributos: { value: "" } }));
    for (const mascota of estado.mascotas) {
      const nombreEspecie = mascota.nombre_especie || "Especie no indicada";
      const opcion = crearElemento("option", { texto: `${mascota.nombre || "Mascota"} · ${nombreEspecie}`, atributos: { value: mascota.id } });
      select.append(opcion);
    }
    select.disabled = estado.mascotas.length === 0;
    estado.regiones.bloqueo.hidden = estado.mascotas.length > 0;
    if (!estado.mascotas.length) {
      estado.regiones.bloqueo.textContent = "Este usuario no tiene mascotas disponibles para consultar.";
      estado.regiones.contenido.replaceChildren(crearEstado("Sin mascotas", "Cuando se registren mascotas para esta cuenta, podrás administrar sus carnets."));
      return;
    }
    const idInicial = mascotaInicial || estado.parametrosIniciales?.mascotaId;
    const mascotaElegida = estado.mascotas.find((item) => String(item.id) === String(idInicial)) || estado.mascotas[0];
    select.value = String(mascotaElegida.id);
    await seleccionarMascota(mascotaElegida);
  } catch (error) {
    if (secuencia !== estado.secuenciaMascotas) return;
    estado.regiones.bloqueo.hidden = false;
    estado.regiones.bloqueo.textContent = mensajeError(error, "No fue posible cargar las mascotas del usuario.");
    estado.regiones.contenido.replaceChildren(crearEstado("No se pudieron cargar las mascotas", mensajeError(error, "Comprueba la conexión e inténtalo nuevamente."), "error", {
      texto: "Reintentar", onClick: () => seleccionarUsuario(usuario, mascotaInicial)
    }));
  }
}

/** Cambia el contexto del carnet y consulta los registros de la mascota elegida. */
async function seleccionarMascota(mascota) {
  estado.mascota = mascota;
  estado.vacunas = [];
  estado.regiones.botonNueva.disabled = !mascota;
  if (!mascota) {
    actualizarContadores([]);
    estado.regiones.contenido.replaceChildren(crearEstado("Selecciona una mascota", "Elige una mascota para ver su carnet."));
    return;
  }
  estado.regiones.bloqueo.hidden = true;
  estado.regiones.contenido.replaceChildren(crearEstado("Cargando carnet", `Consultando las vacunas de ${mascota.nombre || "la mascota"}…`, "cargando"));
  await cargarCarnet();
  if (estado.parametrosIniciales?.citaId && String(estado.parametrosIniciales.mascotaId) === String(mascota.id) && !estado.parametrosIniciales.consumido) {
    estado.parametrosIniciales.consumido = true;
    abrirFormulario(null, estado.parametrosIniciales.citaId);
  }
}

/** Consulta el carnet completo para la mascota actual y vuelve a pintar los contadores. */
async function cargarCarnet() {
  if (!estado.mascota?.id) return;
  const secuencia = ++estado.secuenciaCarnet;
  estado.cargandoCarnet = true;
  estado.regiones.contenido.replaceChildren(crearEstado("Cargando carnet", "Consultando los registros de vacunación…", "cargando"));
  try {
    const respuesta = await api.admin.obtenerVacunasMascota(estado.mascota.id);
    if (secuencia !== estado.secuenciaCarnet) return;
    estado.vacunas = obtenerDatos(respuesta, ["datos", "vacunas", "vacunaciones"]);
    estado.cargandoCarnet = false;
    actualizarContadores(estado.vacunas);
    renderizarCarnet();
  } catch (error) {
    if (secuencia !== estado.secuenciaCarnet) return;
    estado.cargandoCarnet = false;
    estado.vacunas = [];
    actualizarContadores([]);
    estado.regiones.contenido.replaceChildren(crearEstado("No se pudo cargar el carnet", mensajeError(error, "Comprueba tu conexión e inténtalo nuevamente."), "error", {
      texto: "Reintentar", onClick: cargarCarnet
    }));
  }
}

/** Cuenta exclusivamente estados conocidos que entrega el servidor. */
function actualizarContadores(registros) {
  let alDia = 0; let proximas = 0; let pendientes = 0;
  for (const registro of registros) {
    const clave = String(registro.estado || "").toLowerCase();
    if (clave === "al_dia") alDia += 1;
    else if (clave === "proxima") proximas += 1;
    else if (clave === "vencida" || clave === "pendiente") pendientes += 1;
  }
  estado.regiones.alDia.textContent = String(alDia);
  estado.regiones.proximas.textContent = String(proximas);
  estado.regiones.pendientes.textContent = String(pendientes);
}

/** Dibuja la tabla o el estado vacío sin insertar contenido del servidor como HTML. */
function renderizarCarnet() {
  const contenedor = estado.regiones.contenido;
  if (!estado.mascota) {
    contenedor.replaceChildren(crearEstado("Selecciona una mascota", "Elige una mascota para ver su carnet."));
    return;
  }
  if (!estado.vacunas.length) {
    contenedor.replaceChildren(crearElemento("div", { clase: "admin-vacunas-vacio" }));
    const vacio = contenedor.firstElementChild;
    vacio.append(crearElemento("strong", { texto: "Todavía no hay vacunas registradas" }),
      crearElemento("p", { texto: `El carnet de ${estado.mascota.nombre || "esta mascota"} aparecerá aquí cuando registres su primera aplicación.` }));
    const boton = crearElemento("button", { clase: "admin-vacunas-boton", texto: "+ Registrar primera vacuna", atributos: { type: "button" } });
    boton.addEventListener("click", () => abrirFormulario());
    vacio.append(boton);
    return;
  }

  const scroll = crearElemento("div", { clase: "admin-vacunas-tabla-scroll", atributos: { role: "region", tabindex: "0", "aria-label": "Carnet de vacunas; desplaza horizontalmente en pantallas pequeñas" } });
  const tabla = crearElemento("table", { clase: "admin-vacunas-tabla" });
  const thead = crearElemento("thead");
  const filaCabecera = crearElemento("tr");
  for (const titulo of ["Vacuna", "Aplicación", "Próxima dosis", "Veterinaria", "Veterinario", "Lote", "Estado", "Acciones"]) {
    filaCabecera.append(crearElemento("th", { texto: titulo, atributos: { scope: "col" } }));
  }
  thead.append(filaCabecera);
  const tbody = crearElemento("tbody");
  const ordenadas = [...estado.vacunas].sort((a, b) => String(b.fecha_aplicacion || "").localeCompare(String(a.fecha_aplicacion || "")));
  for (const registro of ordenadas) tbody.append(crearFilaVacuna(registro));
  tabla.append(thead, tbody);
  scroll.append(tabla);
  contenedor.replaceChildren(scroll);
}

/** Construye una fila con valores del carnet y acciones de edición/eliminación. */
function crearFilaVacuna(registro) {
  const fila = crearElemento("tr");
  const celdaVacuna = crearElemento("td");
  const nombre = crearElemento("div", { clase: "admin-vacunas-vacuna" });
  nombre.append(crearElemento("strong", { texto: registro.nombre_vacuna || registro.vacuna_nombre || "Vacuna sin nombre" }));
  if (registro.especie_nombre || registro.nombre_especie) nombre.append(crearElemento("small", { texto: registro.especie_nombre || registro.nombre_especie }));
  celdaVacuna.append(nombre);
  const celdaAplicacion = crearElemento("td", { texto: fechaLegible(registro.fecha_aplicacion) });
  const celdaProxima = crearElemento("td", { texto: fechaLegible(registro.proxima_dosis) });
  const celdaVeterinaria = crearElemento("td", { texto: registro.nombre_veterinaria || registro.veterinaria_nombre || "No registrada" });
  const celdaVeterinario = crearElemento("td", { texto: registro.nombre_veterinario || "No registrado" });
  const celdaLote = crearElemento("td", { texto: registro.lote || "No registrado" });
  const celdaEstado = crearElemento("td");
  const clave = String(registro.estado || "").toLowerCase();
  const presentacion = ESTADOS[clave] || { etiqueta: "Sin estado", clase: "admin-vacunas-estado admin-vacunas-estado--neutral" };
  celdaEstado.append(crearElemento("span", { clase: presentacion.clase, texto: presentacion.etiqueta }));
  const acciones = crearElemento("div", { clase: "admin-vacunas-acciones" });
  const editar = crearElemento("button", { clase: "admin-vacunas-accion", texto: "Editar", atributos: { type: "button", "aria-label": `Editar ${registro.nombre_vacuna || "vacuna"}` } });
  editar.addEventListener("click", () => abrirFormulario(registro));
  const eliminar = crearElemento("button", { clase: "admin-vacunas-accion admin-vacunas-accion--eliminar", texto: "Eliminar", atributos: { type: "button", "aria-label": `Eliminar ${registro.nombre_vacuna || "vacuna"}` } });
  eliminar.addEventListener("click", () => eliminarRegistro(registro, eliminar));
  acciones.append(editar, eliminar);
  fila.append(celdaVacuna, celdaAplicacion, celdaProxima, celdaVeterinaria, celdaVeterinario, celdaLote, celdaEstado, crearElemento("td"));
  fila.lastElementChild.append(acciones);
  return fila;
}

/** Consulta en paralelo los catálogos relacionados y las citas que pertenecen a esta mascota. */
async function cargarCatalogosFormulario() {
  if (!estado.mascota?.id) return;
  const secuencia = ++estado.secuenciaCatalogos;
  const mascotaId = estado.mascota.id;
  const especieId = estado.mascota.especie_id;
  const parametrosVacunas = especieId ? { especie_id: especieId } : {};
  const resultados = await Promise.allSettled([
    api.admin.listarCatalogo("vacunas", parametrosVacunas),
    api.admin.listarCatalogo("veterinarias"),
    api.admin.listarCitas({ mascota_id: mascotaId })
  ]);
  if (secuencia !== estado.secuenciaCatalogos || String(estado.mascota?.id) !== String(mascotaId)) return;
  const [vacunas, veterinarias, citas] = resultados;
  if (vacunas.status === "fulfilled") {
    const especieActual = estado.mascota?.especie_id;
    estado.vacunasCatalogo = obtenerDatos(vacunas.value).filter((vacuna) => {
      if (!estaActivo(vacuna)) return false;
      if (!especieActual) return vacuna.especie_id === null || vacuna.especie_id === undefined || vacuna.especie_id === "";
      return vacuna.especie_id === null || vacuna.especie_id === undefined || vacuna.especie_id === "" || String(vacuna.especie_id) === String(especieActual);
    });
  } else {
    estado.vacunasCatalogo = [];
    mostrarErrorDialogo(mensajeError(vacunas.reason, "No fue posible cargar el catálogo de vacunas."));
  }
  if (veterinarias.status === "fulfilled") estado.veterinarias = obtenerDatos(veterinarias.value).filter(estaActivo);
  else { estado.veterinarias = []; mostrarErrorDialogo(mensajeError(veterinarias.reason, "No fue posible cargar las veterinarias.")); }
  if (citas.status === "fulfilled") {
    estado.citas = obtenerDatos(citas.value).filter((cita) => String(cita.mascota_id) === String(mascotaId));
  } else { estado.citas = []; mostrarErrorDialogo(mensajeError(citas.reason, "No fue posible consultar las citas de esta mascota.")); }
  pintarCatalogosFormulario();
}

/** Pinta vacunas filtradas por especie, veterinarias activas y únicamente citas de la mascota actual. */
function pintarCatalogosFormulario(registro = null, citaInicial = null) {
  const regiones = estado.regiones;
  regiones.campoVacuna.replaceChildren(crearElemento("option", { texto: "Selecciona una vacuna", atributos: { value: "" } }));
  for (const vacuna of estado.vacunasCatalogo || []) {
    const nombre = vacuna.nombre || "Vacuna";
    regiones.campoVacuna.append(crearElemento("option", { texto: nombre, atributos: { value: vacuna.id } }));
  }
  if (registro?.vacuna_id && !(estado.vacunasCatalogo || []).some((vacuna) => String(vacuna.id) === String(registro.vacuna_id))) {
    regiones.campoVacuna.append(crearElemento("option", { texto: registro.nombre_vacuna || "Vacuna registrada (inactiva)", atributos: { value: registro.vacuna_id } }));
  }
  regiones.campoVacuna.disabled = !(estado.vacunasCatalogo || []).length && !registro?.vacuna_id;
  if (registro?.vacuna_id) regiones.campoVacuna.value = String(registro.vacuna_id);
  if (!(estado.vacunasCatalogo || []).length) mostrarErrorDialogo("No hay vacunas activas disponibles para la especie seleccionada.");

  regiones.campoVeterinaria.replaceChildren(crearElemento("option", { texto: "Sin veterinaria asociada", atributos: { value: "" } }));
  for (const veterinaria of estado.veterinarias) regiones.campoVeterinaria.append(crearElemento("option", { texto: veterinaria.nombre || "Veterinaria", atributos: { value: veterinaria.id } }));
  if (registro?.veterinaria_id && !estado.veterinarias.some((item) => String(item.id) === String(registro.veterinaria_id))) {
    regiones.campoVeterinaria.append(crearElemento("option", { texto: registro.nombre_veterinaria || "Veterinaria registrada (inactiva)", atributos: { value: registro.veterinaria_id } }));
  }
  if (registro?.veterinaria_id) regiones.campoVeterinaria.value = String(registro.veterinaria_id);

  regiones.campoCita.replaceChildren(crearElemento("option", { texto: "Sin cita asociada", atributos: { value: "" } }));
  for (const cita of estado.citas) {
    const etiqueta = `${fechaLegible(cita.fecha_cita)} · ${String(cita.hora_cita || "").slice(0, 5)} · ${cita.nombre_motivo || cita.nombre_mascota || "Cita veterinaria"}`;
    regiones.campoCita.append(crearElemento("option", { texto: etiqueta, atributos: { value: cita.id } }));
  }
  const citaElegida = citaInicial || registro?.cita_id || estado.parametrosIniciales?.citaId;
  if (citaElegida && estado.citas.some((cita) => String(cita.id) === String(citaElegida))) regiones.campoCita.value = String(citaElegida);
  if (citaElegida && !estado.citas.some((cita) => String(cita.id) === String(citaElegida))) {
    mostrarErrorDialogo("La cita indicada no aparece entre las citas de esta mascota; no se asociará automáticamente.");
  }
  cargarVeterinarios();
}

/** Carga sugerencias de veterinarios vinculados con la veterinaria seleccionada. */
async function cargarVeterinarios() {
  const id = estado.regiones.campoVeterinaria.value;
  estado.regiones.listaVeterinarios.replaceChildren();
  estado.veterinarios = [];
  if (!id) return;
  try {
    const respuesta = await api.admin.listarCatalogo("veterinarios", { veterinaria_id: id });
    if (String(estado.regiones.campoVeterinaria.value) !== String(id)) return;
    estado.veterinarios = obtenerDatos(respuesta).filter(estaActivo);
    for (const veterinario of estado.veterinarios) {
      const opcion = crearElemento("option", { atributos: { value: veterinario.nombre || "" } });
      estado.regiones.listaVeterinarios.append(opcion);
    }
  } catch {
    estado.regiones.listaVeterinarios.replaceChildren();
  }
}

/** Abre el diálogo en modo creación o edición y espera los catálogos reales. */
async function abrirFormulario(registro = null, citaInicial = null) {
  if (!estado.mascota?.id || estado.guardando) return;
  estado.regiones.formulario.reset();
  estado.registroEditando = registro;
  estado.regiones.dialogoTitulo.textContent = registro ? "Editar vacuna" : "Registrar vacuna";
  estado.regiones.guardar.textContent = registro ? "Guardar cambios" : "Guardar vacuna";
  estado.regiones.error.hidden = true;
  estado.regiones.exito.hidden = true;
  estado.regiones.campoAplicacion.max = fechaLocalISO();
  estado.regiones.campoAplicacion.value = registro?.fecha_aplicacion ? String(registro.fecha_aplicacion).slice(0, 10) : "";
  estado.regiones.campoProxima.value = registro?.proxima_dosis ? String(registro.proxima_dosis).slice(0, 10) : "";
  estado.regiones.campoVeterinario.value = registro?.nombre_veterinario || "";
  estado.regiones.campoLote.value = registro?.lote || "";
  estado.regiones.campoNotas.value = registro?.notas || "";
  estado.regiones.campoVacuna.replaceChildren(crearElemento("option", { texto: "Cargando vacunas…", atributos: { value: "" } }));
  estado.regiones.campoVeterinaria.replaceChildren(crearElemento("option", { texto: "Cargando veterinarias…", atributos: { value: "" } }));
  estado.regiones.campoCita.replaceChildren(crearElemento("option", { texto: "Cargando citas…", atributos: { value: "" } }));
  estado.regiones.campoVacuna.disabled = true;
  if (typeof estado.regiones.dialogo.showModal === "function") estado.regiones.dialogo.showModal();
  else estado.regiones.dialogo.setAttribute("open", "");
  await cargarCatalogosFormulario();
  if (registro) {
    estado.regiones.campoVacuna.value = String(registro.vacuna_id || "");
    estado.regiones.campoVeterinaria.value = String(registro.veterinaria_id || "");
    estado.regiones.campoVeterinario.value = registro.nombre_veterinario || "";
    estado.regiones.campoLote.value = registro.lote || "";
    estado.regiones.campoNotas.value = registro.notas || "";
    estado.regiones.campoCita.value = registro.cita_id ? String(registro.cita_id) : "";
  } else if (citaInicial) {
    estado.regiones.campoCita.value = String(citaInicial);
  }
  actualizarLimiteProximaDosis();
  estado.regiones.campoVacuna.focus();
}

/** Ajusta la fecha mínima de refuerzo para que sea posterior a la aplicación. */
function actualizarLimiteProximaDosis() {
  const fecha = estado.regiones.campoAplicacion.value;
  if (!fecha) {
    estado.regiones.campoProxima.removeAttribute("min");
    return;
  }
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const siguiente = new Date(anio, mes - 1, dia + 1);
  const minimo = `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, "0")}-${String(siguiente.getDate()).padStart(2, "0")}`;
  estado.regiones.campoProxima.min = minimo;
  if (estado.regiones.campoProxima.value && estado.regiones.campoProxima.value < minimo) estado.regiones.campoProxima.value = "";
}

/** Valida fechas localmente como ayuda; FastAPI debe repetir todas las validaciones. */
function validarFormulario() {
  const r = estado.regiones;
  if (!estado.usuario?.id || !estado.mascota?.id) return "Selecciona un usuario y una mascota.";
  if (!r.campoVacuna.value) return "Selecciona una vacuna del catálogo.";
  if (!r.campoAplicacion.value) return "Indica la fecha de aplicación.";
  if (r.campoAplicacion.value > fechaLocalISO()) return "La fecha de aplicación no puede ser futura.";
  if (r.campoProxima.value && r.campoProxima.value <= r.campoAplicacion.value) return "La próxima dosis debe ser posterior a la fecha de aplicación.";
  if (r.campoLote.value.length > 50) return "El lote no puede superar 50 caracteres.";
  if (r.campoNotas.value.length > 255) return "Las observaciones no pueden superar 255 caracteres.";
  if (r.campoCita.value && !estado.citas.some((cita) => String(cita.id) === r.campoCita.value && String(cita.mascota_id) === String(estado.mascota.id))) {
    return "La cita asociada debe pertenecer a la mascota seleccionada.";
  }
  return "";
}

/** Convierte los controles en campos de VACUNACIONES y alias que el backend resuelve a VETERINARIOS. */
function construirDatosFormulario() {
  const r = estado.regiones;
  const nombreVeterinario = r.campoVeterinario.value.trim();
  const veterinarioCoincidente = estado.veterinarios.find((item) => String(item.nombre || "").trim().toLocaleLowerCase("es-CO") === nombreVeterinario.toLocaleLowerCase("es-CO"));
  const datos = {
    mascota_id: Number(estado.mascota.id),
    vacuna_id: Number(r.campoVacuna.value),
    fecha_aplicacion: r.campoAplicacion.value,
    proxima_dosis: r.campoProxima.value || null,
    veterinaria_id: r.campoVeterinaria.value ? Number(r.campoVeterinaria.value) : null,
    veterinario_id: veterinarioCoincidente ? Number(veterinarioCoincidente.id) : null,
    nombre_veterinario: nombreVeterinario || null,
    lote: r.campoLote.value.trim() || null,
    notas: r.campoNotas.value.trim() || null,
    cita_id: r.campoCita.value ? Number(r.campoCita.value) : null
  };
  return datos;
}

/** Envía POST o PUT según el modo del formulario y actualiza carnet/contadores sin recargar. */
async function guardarFormulario(evento) {
  evento.preventDefault();
  if (estado.guardando) return;
  const validacion = validarFormulario();
  if (validacion) { mostrarErrorDialogo(validacion); return; }
  const r = estado.regiones;
  estado.guardando = true;
  r.guardar.disabled = true;
  r.guardar.textContent = "Guardando…";
  r.error.hidden = true;
  r.exito.hidden = true;
  const datos = construirDatosFormulario();
  try {
    if (estado.registroEditando?.id) await api.admin.actualizarVacunaAplicada(estado.registroEditando.id, datos);
    else await api.admin.crearVacunaAplicada(datos);
    r.exito.textContent = estado.registroEditando ? "La vacuna se actualizó correctamente." : "La vacuna se registró correctamente.";
    r.exito.hidden = false;
    estado.parametrosIniciales = { ...estado.parametrosIniciales, citaId: null };
    await cargarCarnet();
    window.setTimeout(() => cerrarDialogo(), 350);
  } catch (error) {
    mostrarErrorDialogo(mensajeError(error, "No fue posible guardar la vacuna. Comprueba los datos e inténtalo nuevamente."));
  } finally {
    estado.guardando = false;
    r.guardar.disabled = false;
    r.guardar.textContent = estado.registroEditando ? "Guardar cambios" : "Guardar vacuna";
  }
}

/** Pide confirmación y elimina el registro; después vuelve a consultar carnet y contadores. */
async function eliminarRegistro(registro, boton) {
  if (!registro?.id || estado.eliminandoId) return;
  const nombre = registro.nombre_vacuna || "esta vacuna";
  if (!window.confirm(`¿Deseas eliminar el registro de ${nombre}? Esta acción no se puede deshacer.`)) return;
  estado.eliminandoId = registro.id;
  boton.disabled = true;
  boton.textContent = "Eliminando…";
  try {
    await api.admin.eliminarVacunaAplicada(registro.id);
    await cargarCarnet();
  } catch (error) {
    window.alert(mensajeError(error, "No fue posible eliminar el registro."));
    boton.disabled = false;
    boton.textContent = "Eliminar";
  } finally {
    estado.eliminandoId = null;
  }
}

/** Expone el error del servidor en el propio diálogo sin insertar HTML. */
function mostrarErrorDialogo(mensaje) {
  estado.regiones.error.textContent = mensaje;
  estado.regiones.error.hidden = false;
  estado.regiones.exito.hidden = true;
}

/** Cierra y limpia el diálogo después de cancelar o completar una operación. */
function cerrarDialogo() {
  if (estado.guardando) return;
  if (typeof estado.regiones.dialogo.close === "function") estado.regiones.dialogo.close();
  else estado.regiones.dialogo.removeAttribute("open");
  estado.regiones.formulario.reset();
  estado.registroEditando = null;
  estado.regiones.error.hidden = true;
  estado.regiones.exito.hidden = true;
}

/** Precarga el usuario/mascota/cita enviados desde los módulos 11 o 12. */
async function cargarSeleccionInicial() {
  const parametros = estado.parametrosIniciales;
  if (!parametros?.usuarioId) {
    if (parametros?.mascotaId || parametros?.citaId) {
      estado.regiones.bloqueo.hidden = false;
      estado.regiones.bloqueo.textContent = "La ruta contiene una mascota o cita, pero falta usuario_id para cargar su dueño. Vuelve desde la gestión de citas.";
    }
    return;
  }
  try {
    const respuesta = await api.admin.obtenerUsuario(parametros.usuarioId);
    const usuario = respuesta?.usuario || respuesta;
    if (!usuario?.id) throw new Error("No se encontró la cuenta indicada.");
    await seleccionarUsuario(usuario, parametros.mascotaId);
  } catch (error) {
    estado.regiones.bloqueo.hidden = false;
    estado.regiones.bloqueo.textContent = mensajeError(error, "No fue posible recuperar el usuario de la cita.");
  }
}

/** Inicia la pantalla después de exigir sesión administrativa. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    const sesion = await protegerPagina({ roles: ["administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!sesion) return;
    estado.sesion = sesion;
    estado.parametrosIniciales = {
      usuarioId: new URLSearchParams(window.location.search).get("usuario_id"),
      mascotaId: new URLSearchParams(window.location.search).get("mascota_id"),
      citaId: new URLSearchParams(window.location.search).get("cita_id"),
      consumido: false
    };
    estado.layout = montarLayout({ contenedor, sesion, titulo: "Carnet de vacunas", paginaActual: window.location.pathname });
    construirPagina(estado.layout.contenido);
    contenedor.setAttribute("aria-busy", "false");
    await cargarSeleccionInicial();
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    contenedor.replaceChildren(crearEstado("No pudimos abrir el carnet", mensajeError(error, "Ocurrió un error al preparar la sección administrativa."), "error", {
      texto: "Volver al inicio", onClick: () => window.location.assign(RUTAS.inicio)
    }));
  }
}

iniciar();
