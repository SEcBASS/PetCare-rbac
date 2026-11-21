/** Gestión de citas del administrador: filtros, lista mensual, estados y reprogramación. */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { debounce, formatearFecha, formatearHora, textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html", nueva: "/admin-cita-nueva.html", vacunas: "/admin-vacunas.html" };
const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "pendiente" },
  confirmada: { texto: "Confirmada", clase: "confirmada" },
  completada: { texto: "Completada", clase: "completada" },
  cancelada: { texto: "Cancelada", clase: "cancelada" }
};
const estado = {
  sesion: null, layout: null, citas: [], veterinarias: [], vista: "lista", mes: mesActual(),
  filtros: { estado: "", veterinaria_id: "", fecha: "", usuario_id: "" }, usuarioFiltro: null,
  busquedaGlobal: "", cargando: false, error: null, secuencia: 0, dialogo: null,
  citaActiva: null, horasDisponibles: [], cargandoHoras: false, actualizando: false,
  temporizadorAviso: null, regiones: null
};

/** Devuelve una fecha local en formato ISO sin convertirla a UTC. */
function fechaISO(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Construye la clave AAAA-MM del mes que se está visualizando. */
function mesActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** Crea nodos y asigna datos dinámicos exclusivamente como texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un icono SVG con trazos locales y estáticos. */
function crearIcono(nombre) {
  const trazos = {
    calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
    reloj: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
    huella: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"]
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "21"); svg.setAttribute("height", "21");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7"); svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  for (const d of trazos[nombre] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d); svg.append(path);
  }
  return svg;
}

/** Extrae colecciones del contrato REST sin crear elementos de muestra. */
function obtenerDatos(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

/** Devuelve el texto legible de un error normalizado por el cliente API. */
function mensajeError(error, alternativo) {
  return error instanceof ApiError ? error.error || error.message : error?.message || alternativo;
}

/** Construye las regiones de filtros, vistas, listado y diálogo de gestión. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "admin-citas" });
  const intro = crearElemento("header", { clase: "admin-citas__intro" });
  const introTexto = crearElemento("div", { clase: "admin-citas__intro-texto" });
  const sobrelinea = crearElemento("p", { clase: "admin-citas__sobrelinea" });
  sobrelinea.append(crearIcono("calendario"), document.createTextNode("Agenda veterinaria"));
  introTexto.append(sobrelinea,
    crearElemento("h2", { texto: "Gestión de citas" }),
    crearElemento("p", { texto: "Organiza las citas, consulta la agenda y mantén actualizado su estado." })
  );
  const nueva = crearElemento("a", { clase: "boton", texto: "Agendar cita", atributos: { href: RUTAS.nueva } });
  intro.append(introTexto, nueva);

  const filtros = crearElemento("section", { clase: "admin-citas__filtros", atributos: { "aria-label": "Filtros de citas" } });
  const campoEstado = crearCampoFiltro("Estado", "select", "admin-citas-filtro-estado");
  for (const [valor, texto] of [["", "Todos los estados"], ["pendiente", "Pendiente"], ["confirmada", "Confirmada"], ["completada", "Completada"], ["cancelada", "Cancelada"]]) {
    campoEstado.control.append(crearElemento("option", { texto, atributos: { value: valor } }));
  }
  const campoVeterinaria = crearCampoFiltro("Veterinaria", "select", "admin-citas-filtro-veterinaria");
  campoVeterinaria.control.append(crearElemento("option", { texto: "Todas las veterinarias", atributos: { value: "" } }));
  const campoFecha = crearCampoFiltro("Fecha", "input", "admin-citas-filtro-fecha", { type: "date" });
  const campoUsuario = crearCampoFiltro("Usuario", "input", "admin-citas-filtro-usuario", { type: "search", placeholder: "Buscar nombre o correo…", autocomplete: "off" });
  campoUsuario.wrapper.classList.add("admin-citas__usuario-filtro");
  const sugerencias = crearElemento("div", { clase: "admin-citas__sugerencias", atributos: { role: "listbox", hidden: "" } });
  const usuarioElegido = crearElemento("div", { clase: "admin-citas__usuario-elegido", atributos: { hidden: "", "aria-live": "polite" } });
  campoUsuario.wrapper.append(sugerencias, usuarioElegido);
  campoEstado.control.addEventListener("change", () => { estado.filtros.estado = campoEstado.control.value; cargarCitas(); });
  campoVeterinaria.control.addEventListener("change", () => { estado.filtros.veterinaria_id = campoVeterinaria.control.value; cargarCitas(); });
  campoFecha.control.addEventListener("change", () => { estado.filtros.fecha = campoFecha.control.value; cargarCitas(); });
  const buscarUsuario = debounce((valor) => buscarUsuariosFiltro(valor), 280);
  campoUsuario.control.addEventListener("input", () => {
    estado.usuarioFiltro = null; estado.filtros.usuario_id = ""; usuarioElegido.hidden = true;
    usuarioElegido.replaceChildren();
    buscarUsuario(campoUsuario.control.value.trim());
  });
  campoUsuario.control.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") sugerencias.hidden = true;
  });
  filtros.append(campoEstado.wrapper, campoVeterinaria.wrapper, campoFecha.wrapper, campoUsuario.wrapper);

  const barraVista = crearElemento("div", { clase: "admin-citas__barra-vista" });
  const vistas = crearElemento("div", { clase: "admin-citas__vistas", role: "group", atributos: { "aria-label": "Tipo de vista" } });
  const botonLista = crearElemento("button", { clase: "admin-citas__vista", texto: "Lista", atributos: { type: "button", "aria-pressed": "true" } });
  const botonMes = crearElemento("button", { clase: "admin-citas__vista", texto: "Mes", atributos: { type: "button", "aria-pressed": "false" } });
  botonLista.addEventListener("click", () => cambiarVista("lista"));
  botonMes.addEventListener("click", () => cambiarVista("mes"));
  vistas.append(botonLista, botonMes);
  const navegacionMes = crearElemento("div", { clase: "admin-citas__mes", hidden: "" });
  const anterior = crearElemento("button", { clase: "admin-citas__flecha", texto: "‹", atributos: { type: "button", "aria-label": "Mes anterior" } });
  const textoMes = crearElemento("strong", { texto: "" });
  const siguiente = crearElemento("button", { clase: "admin-citas__flecha", texto: "›", atributos: { type: "button", "aria-label": "Mes siguiente" } });
  anterior.addEventListener("click", () => cambiarMes(-1));
  siguiente.addEventListener("click", () => cambiarMes(1));
  navegacionMes.append(anterior, textoMes, siguiente);
  barraVista.append(vistas, navegacionMes);

  const panel = crearElemento("section", { clase: "admin-citas__panel", atributos: { "aria-live": "polite" } });
  const panelCabecera = crearElemento("header", { clase: "admin-citas__panel-cabecera" });
  const encabezadoTexto = crearElemento("div");
  encabezadoTexto.append(crearElemento("h3", { texto: "Citas registradas" }),
    crearElemento("p", { texto: "Selecciona una cita para cambiar su estado o reprogramarla." }));
  const contador = crearElemento("span", { clase: "admin-citas__estado-carga", texto: "Cargando…", atributos: { id: "admin-citas-contador" } });
  panelCabecera.append(encabezadoTexto, contador);
  const contenido = crearElemento("div", { atributos: { id: "admin-citas-contenido" } });
  panel.append(panelCabecera, contenido);
  const aviso = crearElemento("p", { clase: "admin-citas__aviso-global", atributos: { role: "status", hidden: "" } });

  const dialogo = crearElemento("dialog", { clase: "admin-citas__dialogo", atributos: { "aria-labelledby": "admin-citas-dialogo-titulo" } });
  dialogo.addEventListener("click", (evento) => { if (evento.target === dialogo) dialogo.close(); });
  pagina.append(intro, filtros, barraVista, aviso, panel, dialogo);
  contenedor.replaceChildren(pagina);
  estado.regiones = {
    campoEstado: campoEstado.control, campoVeterinaria: campoVeterinaria.control,
    campoFecha: campoFecha.control, campoUsuario: campoUsuario.control, sugerencias,
    usuarioElegido, botonLista, botonMes, navegacionMes, textoMes, panelCabecera,
    contador, contenido, aviso, dialogo
  };
  return estado.regiones;
}

/** Crea el par etiqueta/control que se usa en la fila de filtros. */
function crearCampoFiltro(etiquetaTexto, tipo, id, atributos = {}) {
  const wrapper = crearElemento("div", { clase: "admin-citas__campo" });
  const etiqueta = crearElemento("label", { texto: etiquetaTexto, atributos: { for: id } });
  const control = crearElemento(tipo, { atributos: { id, ...atributos } });
  wrapper.append(etiqueta, control);
  return { wrapper, control };
}

/** Consulta cuentas para asociar el filtro por usuario a un id real. */
async function buscarUsuariosFiltro(termino) {
  const caja = estado.regiones.sugerencias;
  caja.replaceChildren();
  if (!termino) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.append(crearElemento("p", { clase: "admin-citas__sugerencia", texto: "Buscando usuarios…", atributos: { role: "status" } }));
  try {
    const respuesta = await api.admin.listarUsuarios({ q: termino, pagina: 1 });
    const usuarios = obtenerDatos(respuesta);
    caja.replaceChildren();
    if (!usuarios.length) {
      caja.append(crearElemento("p", { clase: "admin-citas__sugerencia", texto: "No encontramos usuarios con esa búsqueda." }));
      return;
    }
    for (const usuario of usuarios) {
      const boton = crearElemento("button", { clase: "admin-citas__sugerencia", atributos: { type: "button", role: "option" } });
      boton.append(crearElemento("strong", { texto: usuario.nombre_completo || "Nombre no disponible" }),
        crearElemento("small", { texto: usuario.correo || "Correo no disponible" }));
      boton.addEventListener("click", () => {
        estado.usuarioFiltro = usuario; estado.filtros.usuario_id = String(usuario.id);
        estado.regiones.campoUsuario.value = usuario.nombre_completo || usuario.correo || "";
        estado.regiones.usuarioElegido.replaceChildren(
          document.createTextNode(`Filtrando por ${usuario.nombre_completo || usuario.correo} `)
        );
        const quitar = crearElemento("button", { texto: "Quitar", atributos: { type: "button" } });
        quitar.addEventListener("click", () => {
          estado.usuarioFiltro = null; estado.filtros.usuario_id = "";
          estado.regiones.campoUsuario.value = ""; estado.regiones.usuarioElegido.hidden = true; cargarCitas();
        });
        estado.regiones.usuarioElegido.append(quitar);
        estado.regiones.usuarioElegido.hidden = false; caja.hidden = true; cargarCitas();
      });
      caja.append(boton);
    }
  } catch (error) {
    caja.replaceChildren(crearElemento("p", { clase: "admin-citas__sugerencia", texto: mensajeError(error, "No se pudo consultar el catálogo de usuarios.") }));
  }
}

/** Carga veterinarias activas para el filtro; un error no impide consultar citas. */
async function cargarVeterinarias() {
  try {
    const respuesta = await api.admin.listarCatalogo("veterinarias");
    estado.veterinarias = obtenerDatos(respuesta);
    const select = estado.regiones.campoVeterinaria;
    select.replaceChildren(crearElemento("option", { texto: "Todas las veterinarias", atributos: { value: "" } }));
    for (const veterinaria of estado.veterinarias) {
      const opcion = crearElemento("option", { texto: veterinaria.nombre || "Veterinaria", atributos: { value: veterinaria.id } });
      select.append(opcion);
    }
  } catch {
    estado.regiones.campoVeterinaria.disabled = true;
    mostrarAviso("No fue posible cargar el filtro de veterinarias. Puedes seguir consultando las citas.");
  }
}

/** Ensambla solo los filtros presentes y consulta lista general o un mes. */
async function cargarCitas() {
  const secuencia = ++estado.secuencia;
  estado.cargando = true; estado.error = null;
  renderizarContenido();
  const parametros = { ...estado.filtros };
  if (estado.vista === "mes") parametros.mes = estado.mes;
  try {
    const respuesta = await api.admin.listarCitas(parametros);
    if (secuencia !== estado.secuencia) return;
    estado.citas = obtenerDatos(respuesta);
    estado.error = null;
  } catch (error) {
    if (secuencia !== estado.secuencia) return;
    estado.error = error;
  } finally {
    if (secuencia === estado.secuencia) {
      estado.cargando = false;
      renderizarContenido();
    }
  }
}

/** Refleja el modo seleccionado y solicita los datos necesarios a la API. */
function cambiarVista(vista) {
  estado.vista = vista;
  estado.regiones.botonLista.setAttribute("aria-pressed", String(vista === "lista"));
  estado.regiones.botonMes.setAttribute("aria-pressed", String(vista === "mes"));
  estado.regiones.navegacionMes.hidden = vista !== "mes";
  actualizarTituloMes();
  cargarCitas();
}

/** Desplaza un mes manteniendo la clave AAAA-MM. */
function cambiarMes(desplazamiento) {
  const [anio, mes] = estado.mes.split("-").map(Number);
  const fecha = new Date(anio, mes - 1 + desplazamiento, 1);
  estado.mes = mesActual(fecha);
  actualizarTituloMes();
  if (estado.vista === "mes") cargarCitas();
}

/** Presenta el nombre localizado del mes y año del calendario. */
function actualizarTituloMes() {
  if (!estado.regiones) return;
  const [anio, mes] = estado.mes.split("-").map(Number);
  estado.regiones.textoMes.textContent = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date(anio, mes - 1, 1));
}

/** Aplica la búsqueda superior localmente a los registros que devolvió el endpoint. */
function obtenerCitasFiltradas() {
  const termino = estado.busquedaGlobal.trim().toLocaleLowerCase("es-CO");
  const lista = [...estado.citas].sort((a, b) => `${a.fecha_cita || ""} ${a.hora_cita || ""}`.localeCompare(`${b.fecha_cita || ""} ${b.hora_cita || ""}`));
  if (!termino) return lista;
  return lista.filter((cita) => [cita.nombre_mascota, cita.nombre_usuario, cita.nombre_veterinaria, cita.nombre_motivo, cita.estado]
    .some((valor) => textoSeguro(valor).toLocaleLowerCase("es-CO").includes(termino)));
}

/** Renderiza estados de carga, error, lista o calendario. */
function renderizarContenido() {
  const regiones = estado.regiones;
  if (!regiones) return;
  regiones.contenido.replaceChildren();
  if (estado.cargando) {
    regiones.contador.textContent = "Consultando…";
    regiones.contenido.append(crearElemento("div", { clase: "admin-citas__estado-carga", texto: "Cargando citas…", atributos: { role: "status" } }));
    return;
  }
  if (estado.error) {
    regiones.contador.textContent = "No disponible";
    const bloque = crearElemento("div", { clase: "admin-citas__estado-error" });
    bloque.append(crearElemento("strong", { texto: "No pudimos cargar las citas" }),
      crearElemento("p", { texto: mensajeError(estado.error, "Comprueba la conexión e inténtalo nuevamente.") }));
    const boton = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
    boton.addEventListener("click", cargarCitas); bloque.append(boton); regiones.contenido.append(bloque); return;
  }
  const citas = obtenerCitasFiltradas();
  regiones.contador.textContent = `${citas.length} ${citas.length === 1 ? "cita" : "citas"}`;
  if (!citas.length) {
    const vacio = crearElemento("div", { clase: "admin-citas__estado-vacio" });
    vacio.append(crearIcono("calendario"), crearElemento("strong", { texto: "No hay citas para mostrar" }),
      crearElemento("p", { texto: "Cuando se agenden citas o ajustes los filtros, aparecerán aquí." }));
    const boton = crearElemento("a", { clase: "boton boton--secundario", texto: "Agendar cita", atributos: { href: RUTAS.nueva } });
    vacio.append(boton); regiones.contenido.append(vacio); return;
  }
  if (estado.vista === "mes") renderizarCalendario(regiones.contenido, citas);
  else renderizarTabla(regiones.contenido, citas);
}

/** Construye la tabla responsive de citas administrativas. */
function renderizarTabla(contenedor, citas) {
  const scroll = crearElemento("div", { clase: "admin-citas__tabla-scroll", atributos: { role: "region", tabindex: "0", "aria-label": "Lista de citas; desplaza horizontalmente en pantallas pequeñas" } });
  const tabla = crearElemento("table", { clase: "admin-citas__tabla" });
  const thead = crearElemento("thead"); const encabezado = crearElemento("tr");
  for (const titulo of ["Fecha y hora", "Mascota / usuario", "Veterinaria", "Motivo", "Estado", "Acciones"]) encabezado.append(crearElemento("th", { texto: titulo, atributos: { scope: "col" } }));
  thead.append(encabezado);
  const tbody = crearElemento("tbody");
  for (const cita of citas) {
    const fila = crearElemento("tr");
    const fecha = crearElemento("td");
    fecha.append(crearElemento("strong", { texto: cita.fecha_cita ? formatearFecha(cita.fecha_cita) : "Fecha no disponible" }),
      crearElemento("small", { texto: cita.hora_cita ? formatearHora(cita.hora_cita) : "Hora no disponible" }));
    const identidad = crearElemento("td");
    identidad.append(crearElemento("strong", { texto: cita.nombre_mascota || "Mascota no disponible" }),
      crearElemento("small", { texto: cita.nombre_usuario || "Usuario no disponible" }));
    const vet = crearElemento("td", { texto: cita.nombre_veterinaria || "Veterinaria no disponible" });
    const motivo = crearElemento("td", { texto: cita.nombre_motivo || "Motivo no disponible" });
    const celdaEstado = crearElemento("td"); celdaEstado.append(crearPastillaEstado(cita.estado));
    const accion = crearElemento("td");
    const boton = crearElemento("button", { clase: "admin-citas__accion", texto: "Gestionar", atributos: { type: "button" } });
    boton.addEventListener("click", () => abrirDialogo(cita)); accion.append(boton);
    fila.append(fecha, identidad, vet, motivo, celdaEstado, accion); tbody.append(fila);
  }
  tabla.append(thead, tbody); scroll.append(tabla); contenedor.append(scroll);
}

/** Devuelve una insignia segura para cada estado conocido. */
function crearPastillaEstado(valor) {
  const estadoCita = ESTADOS[valor] || { texto: "Estado no disponible", clase: "pendiente" };
  return crearElemento("span", { clase: `admin-citas__estado admin-citas__estado--${estadoCita.clase}`, texto: estadoCita.texto });
}

/** Construye el calendario del mes con los eventos que entregó el servidor. */
function renderizarCalendario(contenedor, citas) {
  const [anio, mes] = estado.mes.split("-").map(Number);
  const primero = new Date(anio, mes - 1, 1);
  const desplazamiento = (primero.getDay() + 6) % 7;
  const inicio = new Date(anio, mes - 1, 1 - desplazamiento);
  const calendario = crearElemento("div", { clase: "admin-citas__calendario", atributos: { role: "grid", "aria-label": `Calendario de citas de ${estado.mes}` } });
  for (const nombre of ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]) calendario.append(crearElemento("div", { clase: "admin-citas__dia-semana", texto: nombre, atributos: { role: "columnheader" } }));
  const hoy = fechaISO(new Date());
  for (let indice = 0; indice < 42; indice += 1) {
    const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + indice);
    const clave = fechaISO(fecha);
    const dia = crearElemento("div", { clase: `admin-citas__dia${fecha.getMonth() !== mes - 1 ? " admin-citas__dia--otro" : ""}${clave === hoy ? " admin-citas__dia--hoy" : ""}`, atributos: { role: "gridcell", "aria-label": formatearFecha(clave) } });
    dia.append(crearElemento("span", { clase: "admin-citas__dia-numero", texto: String(fecha.getDate()) }));
    const eventos = citas.filter((cita) => cita.fecha_cita === clave);
    for (const cita of eventos.slice(0, 3)) {
      const claveEstado = ESTADOS[cita.estado]?.clase || "pendiente";
      const boton = crearElemento("button", { clase: `admin-citas__evento admin-citas__evento--${claveEstado}`, atributos: { type: "button", title: `${cita.nombre_mascota || "Mascota"} · ${cita.hora_cita || ""}` } });
      boton.append(crearElemento("strong", { texto: `${cita.hora_cita ? formatearHora(cita.hora_cita) : "Hora"} · ${cita.nombre_mascota || "Mascota"}` }),
        crearElemento("span", { texto: cita.nombre_veterinaria || "Veterinaria" }));
      boton.addEventListener("click", () => abrirDialogo(cita)); dia.append(boton);
    }
    if (eventos.length > 3) dia.append(crearElemento("small", { texto: `+${eventos.length - 3} más` }));
    calendario.append(dia);
  }
  contenedor.append(calendario);
}

/** Abre el diálogo de gestión y prepara sus secciones de estado y reprogramación. */
function abrirDialogo(cita) {
  estado.citaActiva = cita; estado.horasDisponibles = []; estado.cargandoHoras = false; estado.actualizando = false;
  const dialogo = estado.regiones.dialogo; dialogo.replaceChildren();
  const cabecera = crearElemento("header", { clase: "admin-citas-dialogo__cabecera" });
  const titulo = crearElemento("div");
  titulo.append(crearElemento("h3", { texto: "Gestionar cita", atributos: { id: "admin-citas-dialogo-titulo" } }),
    crearElemento("p", { texto: `Cita #${cita.id}` }));
  const cerrar = crearElemento("button", { clase: "admin-citas-dialogo__cerrar", texto: "×", atributos: { type: "button", "aria-label": "Cerrar diálogo" } });
  cerrar.addEventListener("click", () => dialogo.close()); cabecera.append(titulo, cerrar);

  const cuerpo = crearElemento("div", { clase: "admin-citas-dialogo__cuerpo" });
  const resumen = crearElemento("section", { clase: "admin-citas-dialogo__resumen", atributos: { "aria-label": "Resumen de la cita" } });
  const datos = [
    ["Mascota", cita.nombre_mascota], ["Usuario", cita.nombre_usuario],
    ["Veterinaria", cita.nombre_veterinaria], ["Motivo", cita.nombre_motivo],
    ["Fecha", cita.fecha_cita ? formatearFecha(cita.fecha_cita) : "No disponible"],
    ["Hora", cita.hora_cita ? formatearHora(cita.hora_cita) : "No disponible"]
  ];
  for (const [etiqueta, valor] of datos) {
    const celda = crearElemento("div", { clase: "admin-citas-dialogo__dato" });
    celda.append(crearElemento("span", { texto: etiqueta }), crearElemento("strong", { texto: valor || "No disponible" })); resumen.append(celda);
  }
  cuerpo.append(resumen);

  const seccionEstado = crearElemento("section", { clase: "admin-citas-dialogo__seccion" });
  seccionEstado.append(crearElemento("h4", { texto: "Estado de la cita" }));
  const filaEstado = crearElemento("div", { clase: "admin-citas-dialogo__fila" });
  const selectEstado = crearElemento("select", { atributos: { "aria-label": "Nuevo estado de la cita" } });
  for (const [valor, presentacion] of Object.entries(ESTADOS)) selectEstado.append(crearElemento("option", { texto: presentacion.texto, atributos: { value: valor, selected: valor === cita.estado ? "selected" : null } }));
  const guardarEstado = crearElemento("button", { clase: "boton", texto: "Guardar estado", atributos: { type: "button" } });
  const avisoEstado = crearElemento("p", { clase: "admin-citas-dialogo__aviso", atributos: { role: "status", hidden: "" } });
  guardarEstado.addEventListener("click", () => actualizarEstadoCita(cita, selectEstado.value, guardarEstado, avisoEstado));
  filaEstado.append(selectEstado, guardarEstado); seccionEstado.append(filaEstado, avisoEstado);
  const enlaceVacuna = crearElemento("a", { clase: "admin-citas-dialogo__vacuna-enlace", texto: "Registrar vacuna", atributos: { href: construirRutaVacuna(cita), hidden: "" } });
  if (cita.estado === "completada") enlaceVacuna.hidden = false;
  seccionEstado.append(enlaceVacuna); cuerpo.append(seccionEstado);

  const seccionReprogramar = crearElemento("section", { clase: "admin-citas-dialogo__seccion" });
  seccionReprogramar.append(crearElemento("h4", { texto: "Reprogramar cita" }),
    crearElemento("p", { texto: "Elige una nueva fecha y consulta los horarios libres de esta veterinaria." }));
  const filaFecha = crearElemento("div", { clase: "admin-citas-dialogo__fila" });
  const campoFecha = crearElemento("input", { atributos: { type: "date", min: fechaISO(new Date()), value: cita.fecha_cita || "", "aria-label": "Nueva fecha" } });
  const consultar = crearElemento("button", { clase: "boton boton--secundario", texto: "Consultar horas", atributos: { type: "button" } });
  const horas = crearElemento("select", { atributos: { disabled: "", "aria-label": "Nueva hora disponible" } });
  horas.append(crearElemento("option", { texto: "Primero consulta una fecha", atributos: { value: "" } }));
  const estadoHoras = crearElemento("p", { clase: "admin-citas-dialogo__aviso", atributos: { role: "status", hidden: "" } });
  const guardarNuevaFecha = crearElemento("button", { clase: "boton", texto: "Confirmar reprogramación", atributos: { type: "button", disabled: "" } });
  consultar.addEventListener("click", () => cargarHorasDialogo(cita, campoFecha.value, horas, estadoHoras, guardarNuevaFecha, consultar));
  campoFecha.addEventListener("change", () => { horas.disabled = true; horas.replaceChildren(crearElemento("option", { texto: "Consulta los horarios de esta fecha", atributos: { value: "" } })); guardarNuevaFecha.disabled = true; estadoHoras.hidden = true; });
  horas.addEventListener("change", () => { guardarNuevaFecha.disabled = !horas.value; });
  guardarNuevaFecha.addEventListener("click", () => reprogramarCita(cita, campoFecha.value, horas.value, guardarNuevaFecha, estadoHoras));
  filaFecha.append(campoFecha, consultar);
  const filaHoras = crearElemento("div", { clase: "admin-citas-dialogo__horas" });
  const campoHoras = crearElemento("label", { texto: "Hora disponible" });
  campoHoras.append(horas); filaHoras.append(campoHoras, guardarNuevaFecha);
  seccionReprogramar.append(filaFecha, estadoHoras, filaHoras); cuerpo.append(seccionReprogramar);

  dialogo.append(cabecera, cuerpo);
  if (typeof dialogo.showModal === "function") dialogo.showModal();
  else dialogo.setAttribute("open", "");
}

/** Construye la URL del módulo de vacunas con la cita y mascota ya relacionadas. */
function construirRutaVacuna(cita) {
  const parametros = new URLSearchParams();
  if (cita.id) parametros.set("cita_id", cita.id);
  if (cita.mascota_id) parametros.set("mascota_id", cita.mascota_id);
  if (cita.usuario_id) parametros.set("usuario_id", cita.usuario_id);
  return `${RUTAS.vacunas}?${parametros.toString()}`;
}

/** Pide confirmación antes de modificar el estado en el servidor. */
async function actualizarEstadoCita(cita, nuevoEstado, boton, aviso) {
  if (!ESTADOS[nuevoEstado] || nuevoEstado === cita.estado || estado.actualizando) return;
  const etiqueta = ESTADOS[nuevoEstado].texto.toLocaleLowerCase("es-CO");
  if (!window.confirm(`¿Confirmas cambiar el estado de esta cita a ${etiqueta}?`)) return;
  estado.actualizando = true; boton.disabled = true;
  try {
    const respuesta = await api.admin.actualizarCita(cita.id, { estado: nuevoEstado });
    const citaActualizada = respuesta?.cita || { ...cita, estado: nuevoEstado };
    cita.estado = citaActualizada.estado || nuevoEstado;
    aviso.textContent = "El estado de la cita se actualizó correctamente."; aviso.hidden = false;
    const enlace = estado.regiones.dialogo.querySelector(".admin-citas-dialogo__vacuna-enlace");
    if (cita.estado === "completada" && enlace) enlace.hidden = false;
    await cargarCitas();
    mostrarAviso("Estado de la cita actualizado.");
  } catch (error) {
    aviso.textContent = mensajeError(error, "No fue posible actualizar el estado."); aviso.classList.add("admin-citas-dialogo__aviso--error"); aviso.hidden = false;
  } finally {
    estado.actualizando = false; boton.disabled = false;
  }
}

/** Consulta disponibilidad real para la fecha elegida, excluyendo la propia cita al moverla. */
async function cargarHorasDialogo(cita, fecha, select, aviso, botonGuardar, botonConsultar) {
  if (!fecha || !cita.veterinaria_id || estado.cargandoHoras) return;
  estado.cargandoHoras = true; botonConsultar.disabled = true; botonGuardar.disabled = true;
  aviso.textContent = "Consultando horarios disponibles…"; aviso.classList.remove("admin-citas-dialogo__aviso--error"); aviso.hidden = false;
  select.disabled = true;
  try {
    const respuesta = await api.admin.obtenerDisponibilidad({ veterinaria_id: cita.veterinaria_id, fecha, excluir_cita_id: cita.id });
    const horas = normalizarHorasDisponibles(respuesta);
    select.replaceChildren(crearElemento("option", { texto: horas.length ? "Selecciona una hora" : "No hay horas libres", atributos: { value: "" } }));
    for (const hora of horas) select.append(crearElemento("option", { texto: formatearHora(hora), atributos: { value: hora } }));
    select.disabled = !horas.length;
    aviso.textContent = horas.length ? `Encontramos ${horas.length} horarios disponibles.` : "No hay horarios disponibles para esa fecha.";
  } catch (error) {
    aviso.textContent = mensajeError(error, "No fue posible consultar la disponibilidad."); aviso.classList.add("admin-citas-dialogo__aviso--error");
  } finally {
    estado.cargandoHoras = false; botonConsultar.disabled = false;
  }
}

/** Admite la forma de horas del contrato y evita inventar franjas horarias en el navegador. */
function normalizarHorasDisponibles(respuesta) {
  const lista = Array.isArray(respuesta?.horas_disponibles) ? respuesta.horas_disponibles : obtenerDatos(respuesta);
  return lista.map((item) => typeof item === "string" ? item : item?.hora_cita || item?.hora).filter(Boolean);
}

/** Valida en el servidor la nueva fecha y hora antes de cerrar el diálogo. */
async function reprogramarCita(cita, fecha, hora, boton, aviso) {
  if (!fecha || !hora || estado.actualizando) return;
  if (!window.confirm("¿Confirmas reprogramar esta cita con la nueva fecha y hora?")) return;
  estado.actualizando = true; boton.disabled = true;
  try {
    await api.admin.actualizarCita(cita.id, { fecha_cita: fecha, hora_cita: hora });
    estado.regiones.dialogo.close();
    mostrarAviso("La cita se reprogramó correctamente.");
    await cargarCitas();
  } catch (error) {
    aviso.textContent = mensajeError(error, "No fue posible reprogramar la cita.");
    if (error?.status === 409 || /horario|disponib|ocupad/i.test(aviso.textContent)) {
      aviso.textContent = "Ese horario acaba de ocuparse. Consulta nuevamente la disponibilidad.";
    }
    aviso.classList.add("admin-citas-dialogo__aviso--error"); aviso.hidden = false;
  } finally {
    estado.actualizando = false; boton.disabled = false;
  }
}

/** Presenta un aviso temporal de operación confirmada. */
function mostrarAviso(mensaje) {
  const aviso = estado.regiones.aviso; aviso.textContent = mensaje; aviso.hidden = false;
  if (estado.temporizadorAviso) window.clearTimeout(estado.temporizadorAviso);
  estado.temporizadorAviso = window.setTimeout(() => { aviso.hidden = true; aviso.textContent = ""; estado.temporizadorAviso = null; }, 4200);
}

/** Inicializa sesión, layout, catálogos y listado sin cargar datos de ejemplo. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!estado.sesion) return;
    let aplicarBusquedaGlobal = () => {};
    estado.layout = montarLayout({ contenedor, sesion: estado.sesion, titulo: "Citas", paginaActual: "/admin-citas.html", onBuscar: (termino) => aplicarBusquedaGlobal(termino) });
    construirPagina(estado.layout.contenido);
    aplicarBusquedaGlobal = (termino) => { estado.busquedaGlobal = termino; renderizarContenido(); };
    contenedor.setAttribute("aria-busy", "false");
    actualizarTituloMes();
    await Promise.all([cargarVeterinarias(), cargarCitas()]);
    await abrirCitaDesdeUrl();
    if (new URLSearchParams(window.location.search).get("creada") === "1") mostrarAviso("La cita se agendó correctamente.");
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false"); mostrarErrorInicial(contenedor, error);
  }
}

/** Permite abrir directamente una cita desde un enlace interno del sistema. */
async function abrirCitaDesdeUrl() {
  const parametros = new URLSearchParams(window.location.search);
  const citaId = parametros.get("cita_id");
  if (!citaId) return;
  const cita = estado.citas.find((item) => String(item.id) === citaId);
  if (cita) abrirDialogo(cita);
}

/** Expone un estado de inicio recuperable si falla la autenticación o el layout. */
function mostrarErrorInicial(contenedor, error) {
  const tarjeta = crearElemento("section", { clase: "admin-citas__estado-error" });
  tarjeta.append(crearElemento("strong", { texto: "No pudimos abrir la gestión de citas" }),
    crearElemento("p", { texto: mensajeError(error, "Ocurrió un error al validar la sesión o preparar la página.") }));
  const boton = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
  boton.addEventListener("click", () => window.location.reload()); tarjeta.append(boton); contenedor.replaceChildren(tarjeta);
}

iniciar();
