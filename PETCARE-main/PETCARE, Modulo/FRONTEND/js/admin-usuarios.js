/**
 * Módulo administrativo de usuarios y mascotas.
 * La lista, el estado de las cuentas y el detalle de mascotas proceden de la API REST.
 * La protección visual por rol no reemplaza la autorización que debe ejecutar FastAPI.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { debounce, formatearFecha, iniciales, textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  inicio: "/inicio.html",
  citas: "/admin/citas.html",
  vacunas: "/admin-vacunas.html"
};

const estado = {
  sesion: null,
  layout: null,
  usuarios: [],
  busqueda: "",
  pagina: 1,
  totalPaginas: 1,
  totalRegistros: null,
  cargando: false,
  error: null,
  secuenciaLista: 0,
  usuarioSeleccionado: null,
  mascotasUsuario: [],
  cargandoDetalle: false,
  errorDetalle: null,
  secuenciaDetalle: 0,
  actualizandoUsuarioId: null,
  regiones: null,
  temporizadorAviso: null
};

/** Crea elementos HTML asignando texto plano y atributos controlados. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Construye un icono vectorial usando únicamente trazos estáticos del módulo. */
function crearIcono(nombre) {
  const trazos = {
    usuarios: ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M20 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
    buscar: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
    mascota: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
    cerrar: ["M18 6 6 18", "m6 6 12 12"],
    flecha: ["M5 12h14", "m12 5 7 7-7 7"],
    reloj: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
    ubicacion: ["M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z", "M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"]
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const trazo of trazos[nombre] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", trazo);
    svg.append(path);
  }
  return svg;
}

/** Devuelve un arreglo desde la colección documentada por el contrato de administración. */
function obtenerDatos(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

/** Acepta fotografías HTTPS o del mismo origen para evitar esquemas de URL activos. */
function obtenerFotoSegura(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor, window.location.origin);
    if (url.protocol === "https:" || url.origin === window.location.origin) return url.href;
    return null;
  } catch {
    return null;
  }
}

/** Muestra cantidades solo cuando el backend entrega un valor numérico real. */
function formatearCantidad(valor) {
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(Number(valor))) return "No disponible";
  return new Intl.NumberFormat("es-CO").format(Number(valor));
}

/** Construye los controles, la tabla y los diálogos de trabajo de esta página. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "admin-usuarios" });
  const encabezado = crearElemento("header", { clase: "admin-usuarios__intro" });
  const sobrelinea = crearElemento("p", { clase: "admin-usuarios__sobrelinea" });
  sobrelinea.append(crearIcono("usuarios"), document.createTextNode("Gestión de cuentas"));
  encabezado.append(
    sobrelinea,
    crearElemento("h2", { texto: "Usuarios y mascotas" }),
    crearElemento("p", { texto: "Consulta las cuentas registradas y administra su acceso a PetCare." })
  );

  const resumen = crearElemento("section", { clase: "admin-usuarios__resumen", atributos: { "aria-label": "Resumen del listado" } });
  const resumenIcono = crearElemento("span", { clase: "admin-usuarios__resumen-icono" });
  resumenIcono.append(crearIcono("usuarios"));
  const resumenTexto = crearElemento("div", { clase: "admin-usuarios__resumen-texto" });
  resumenTexto.append(
    crearElemento("span", { texto: "Cuentas encontradas" }),
    crearElemento("strong", { texto: "—", atributos: { id: "admin-usuarios-total" } })
  );
  resumen.append(resumenIcono, resumenTexto);

  const tarjeta = crearElemento("section", { clase: "admin-usuarios__tarjeta", atributos: { "aria-labelledby": "admin-usuarios-tabla-titulo" } });
  const tarjetaEncabezado = crearElemento("div", { clase: "admin-usuarios__tarjeta-encabezado" });
  const textosEncabezado = crearElemento("div");
  textosEncabezado.append(
    crearElemento("h3", { texto: "Cuentas registradas", atributos: { id: "admin-usuarios-tabla-titulo" } }),
    crearElemento("p", { texto: "Busca por nombre o correo y consulta el detalle de cada cuenta." })
  );

  const formularioBusqueda = crearElemento("form", { clase: "admin-usuarios__busqueda", atributos: { role: "search", "aria-label": "Buscar usuarios" } });
  const etiquetaBusqueda = crearElemento("label", { clase: "sr-only", texto: "Buscar por nombre o correo", atributos: { for: "admin-usuarios-buscar" } });
  const campoBusqueda = crearElemento("input", {
    clase: "admin-usuarios__campo-busqueda",
    atributos: {
      id: "admin-usuarios-buscar",
      name: "q",
      type: "search",
      placeholder: "Nombre o correo…",
      autocomplete: "off",
      maxlength: "150"
    }
  });
  const iconoBusqueda = crearElemento("span", { clase: "admin-usuarios__busqueda-icono", atributos: { "aria-hidden": "true" } });
  iconoBusqueda.append(crearIcono("buscar"));
  formularioBusqueda.append(etiquetaBusqueda, iconoBusqueda, campoBusqueda);
  formularioBusqueda.addEventListener("submit", (evento) => {
    evento.preventDefault();
    aplicarBusqueda(campoBusqueda.value);
  });
  campoBusqueda.addEventListener("input", () => aplicarBusquedaConDemora(campoBusqueda.value));

  tarjetaEncabezado.append(textosEncabezado, formularioBusqueda);
  const tablaScroll = crearElemento("div", { clase: "admin-usuarios__tabla-scroll", atributos: { role: "region", "aria-label": "Tabla de usuarios; desplaza horizontalmente en pantallas pequeñas", tabindex: "0" } });
  const tabla = crearElemento("table", { clase: "admin-usuarios__tabla" });
  const thead = crearElemento("thead");
  const filaEncabezado = crearElemento("tr");
  for (const titulo of ["Usuario", "Correo", "Teléfono", "Estado", "Fecha de registro", "Mascotas", "Acciones"]) {
    filaEncabezado.append(crearElemento("th", { texto: titulo, atributos: { scope: "col" } }));
  }
  thead.append(filaEncabezado);
  const tbody = crearElemento("tbody", { atributos: { id: "admin-usuarios-filas" } });
  tabla.append(thead, tbody);
  tablaScroll.append(tabla);

  const pieTabla = crearElemento("div", { clase: "admin-usuarios__pie-tabla" });
  const estadoListado = crearElemento("p", { clase: "admin-usuarios__estado-listado", texto: "Consultando usuarios…", atributos: { role: "status", "aria-live": "polite" } });
  const paginacion = crearElemento("nav", { clase: "admin-usuarios__paginacion", atributos: { "aria-label": "Paginación de usuarios" } });
  const botonAnterior = crearElemento("button", { clase: "admin-usuarios__pagina-boton", texto: "Anterior", atributos: { type: "button" } });
  botonAnterior.addEventListener("click", () => cambiarPagina(-1));
  const paginaActual = crearElemento("span", { clase: "admin-usuarios__pagina-actual", texto: "Página 1 de 1", atributos: { "aria-live": "polite" } });
  const botonSiguiente = crearElemento("button", { clase: "admin-usuarios__pagina-boton", texto: "Siguiente", atributos: { type: "button" } });
  botonSiguiente.addEventListener("click", () => cambiarPagina(1));
  paginacion.append(botonAnterior, paginaActual, botonSiguiente);
  pieTabla.append(estadoListado, paginacion);

  tarjeta.append(tarjetaEncabezado, tablaScroll, pieTabla);
  const aviso = crearElemento("div", { clase: "admin-usuarios__aviso", atributos: { role: "status", "aria-live": "polite", hidden: "" } });
  pagina.append(encabezado, resumen, tarjeta, aviso);
  contenedor.replaceChildren(pagina);

  const dialogoConfirmacion = crearDialogoConfirmacion(pagina);
  const dialogoDetalle = crearDialogoDetalle(pagina);

  return {
    pagina,
    total: resumenTexto.querySelector("strong"),
    filas: tbody,
    estadoListado,
    paginaActual,
    botonAnterior,
    botonSiguiente,
    aviso,
    campoBusqueda,
    dialogoConfirmacion,
    dialogoDetalle
  };
}

/** Construye un diálogo nativo para confirmar el cambio de acceso de una cuenta. */
function crearDialogoConfirmacion(contenedor) {
  const dialogo = crearElemento("dialog", { clase: "admin-usuarios-dialogo", atributos: { "aria-labelledby": "admin-usuarios-confirmar-titulo" } });
  const tarjeta = crearElemento("div", { clase: "admin-usuarios-dialogo__contenido" });
  const icono = crearElemento("span", { clase: "admin-usuarios-dialogo__icono" });
  icono.append(crearIcono("usuarios"));
  const titulo = crearElemento("h2", { texto: "Cambiar acceso de usuario", atributos: { id: "admin-usuarios-confirmar-titulo" } });
  const descripcion = crearElemento("p", { clase: "admin-usuarios-dialogo__descripcion" });
  const error = crearElemento("p", { clase: "admin-usuarios-dialogo__error", atributos: { role: "alert", hidden: "" } });
  const acciones = crearElemento("div", { clase: "admin-usuarios-dialogo__acciones" });
  const cancelar = crearElemento("button", { clase: "boton boton--secundario", texto: "Cancelar", atributos: { type: "button" } });
  const confirmar = crearElemento("button", { clase: "boton", texto: "Confirmar", atributos: { type: "button" } });
  cancelar.addEventListener("click", () => dialogo.close());
  confirmar.addEventListener("click", confirmarCambioEstado);
  acciones.append(cancelar, confirmar);
  tarjeta.append(icono, titulo, descripcion, error, acciones);
  dialogo.append(tarjeta);
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
  dialogo.addEventListener("close", () => {
    const origen = estado.regiones?.dialogoConfirmacion?.botonOrigen;
    if (origen?.isConnected) origen.focus();
  });
  contenedor.append(dialogo);
  return { dialogo, descripcion, error, confirmar, cancelar, botonOrigen: null };
}

/** Construye el detalle modal del usuario y sus mascotas asociadas. */
function crearDialogoDetalle(contenedor) {
  const dialogo = crearElemento("dialog", { clase: "admin-usuarios-detalle", atributos: { "aria-labelledby": "admin-usuarios-detalle-titulo" } });
  const tarjeta = crearElemento("div", { clase: "admin-usuarios-detalle__contenido" });
  const encabezado = crearElemento("header", { clase: "admin-usuarios-detalle__encabezado" });
  const encabezadoTexto = crearElemento("div");
  encabezadoTexto.append(
    crearElemento("p", { clase: "admin-usuarios__sobrelinea", texto: "Ficha de cuenta" }),
    crearElemento("h2", { texto: "Detalle del usuario", atributos: { id: "admin-usuarios-detalle-titulo" } })
  );
  const cerrar = crearElemento("button", { clase: "admin-usuarios-detalle__cerrar", atributos: { type: "button", "aria-label": "Cerrar detalle" } });
  cerrar.append(crearIcono("cerrar"));
  cerrar.addEventListener("click", () => dialogo.close());
  encabezado.append(encabezadoTexto, cerrar);

  const perfil = crearElemento("section", { clase: "admin-usuarios-detalle__perfil", atributos: { "aria-label": "Información del usuario" } });
  const mascotasEncabezado = crearElemento("div", { clase: "admin-usuarios-detalle__mascotas-encabezado" });
  mascotasEncabezado.append(
    crearElemento("h3", { texto: "Mascotas registradas" }),
    crearElemento("span", { clase: "admin-usuarios-detalle__contador", texto: "—", atributos: { id: "admin-usuarios-detalle-contador" } })
  );
  const mascotas = crearElemento("div", { clase: "admin-usuarios-detalle__mascotas", atributos: { id: "admin-usuarios-detalle-mascotas", "aria-live": "polite" } });
  const mensajeError = crearElemento("p", { clase: "admin-usuarios-detalle__error", atributos: { role: "alert", hidden: "" } });
  const reintentar = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button", hidden: "" } });
  reintentar.addEventListener("click", () => {
    if (estado.usuarioSeleccionado) cargarDetalleUsuario(estado.usuarioSeleccionado, { mantenerDialogo: true });
  });

  const acciones = crearElemento("footer", { clase: "admin-usuarios-detalle__acciones" });
  const agendar = crearElemento("a", { clase: "boton", texto: "Agendar cita", atributos: { href: RUTAS.citas } });
  const carnet = crearElemento("a", { clase: "boton boton--secundario", texto: "Carnet de vacunas", atributos: { href: RUTAS.vacunas } });
  acciones.append(agendar, carnet);
  tarjeta.append(encabezado, perfil, mascotasEncabezado, mascotas, mensajeError, reintentar, acciones);
  dialogo.append(tarjeta);
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
  dialogo.addEventListener("close", () => {
    if (estado.ultimoBotonDetalle?.isConnected) estado.ultimoBotonDetalle.focus();
  });
  contenedor.append(dialogo);
  return { dialogo, perfil, mascotas, contador: mascotasEncabezado.querySelector("span"), mensajeError, reintentar, agendar, carnet };
}

/** Actualiza la búsqueda, vuelve a la primera página y consulta el servidor. */
function aplicarBusqueda(valor) {
  const termino = textoSeguro(valor).trim();
  if (termino === estado.busqueda) return;
  estado.busqueda = termino;
  estado.pagina = 1;
  cargarUsuarios();
}

const aplicarBusquedaConDemora = debounce(aplicarBusqueda, 300);

/** Cambia de página solo dentro de los límites que informa el servidor. */
function cambiarPagina(direccion) {
  const destino = estado.pagina + direccion;
  if (destino < 1 || destino > estado.totalPaginas || estado.cargando) return;
  estado.pagina = destino;
  cargarUsuarios();
}

/** Consulta la lista paginada y descarta respuestas antiguas si hubo otra búsqueda. */
async function cargarUsuarios() {
  const secuencia = ++estado.secuenciaLista;
  estado.cargando = true;
  estado.error = null;
  renderizarTabla();

  try {
    const respuesta = await api.admin.listarUsuarios({ q: estado.busqueda, pagina: estado.pagina });
    if (secuencia !== estado.secuenciaLista) return;

    estado.usuarios = obtenerDatos(respuesta);
    const paginaServidor = Number(respuesta?.pagina);
    const paginasServidor = Number(respuesta?.total_paginas);
    const registrosServidor = Number(respuesta?.total_registros);
    estado.pagina = Number.isInteger(paginaServidor) && paginaServidor > 0 ? paginaServidor : estado.pagina;
    estado.totalPaginas = Number.isInteger(paginasServidor) && paginasServidor > 0 ? paginasServidor : 1;
    estado.totalRegistros = Number.isFinite(registrosServidor) && registrosServidor >= 0 ? registrosServidor : null;
  } catch (error) {
    if (secuencia !== estado.secuenciaLista) return;
    estado.error = error;
    estado.usuarios = [];
  } finally {
    if (secuencia === estado.secuenciaLista) {
      estado.cargando = false;
      renderizarTabla();
    }
  }
}

/** Dibuja el resumen, el estado de la consulta, las filas y los controles de paginación. */
function renderizarTabla() {
  const regiones = estado.regiones;
  if (!regiones) return;
  regiones.filas.replaceChildren();
  regiones.total.textContent = estado.totalRegistros === null ? "—" : formatearCantidad(estado.totalRegistros);
  regiones.paginaActual.textContent = `Página ${estado.pagina} de ${estado.totalPaginas}`;
  regiones.botonAnterior.disabled = estado.cargando || estado.pagina <= 1;
  regiones.botonSiguiente.disabled = estado.cargando || estado.pagina >= estado.totalPaginas;

  if (estado.cargando) {
    const fila = crearElemento("tr", { clase: "admin-usuarios__fila-estado" });
    const celda = crearElemento("td", { texto: "Consultando las cuentas registradas…", atributos: { colspan: "7" } });
    fila.append(celda);
    regiones.filas.append(fila);
    regiones.estadoListado.textContent = "Cargando usuarios…";
    return;
  }

  if (estado.error) {
    const fila = crearElemento("tr", { clase: "admin-usuarios__fila-estado" });
    const celda = crearElemento("td", { atributos: { colspan: "7" } });
    const mensaje = crearElemento("p", { texto: obtenerMensajeError(estado.error, "No fue posible cargar los usuarios.") });
    const reintentar = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
    reintentar.addEventListener("click", cargarUsuarios);
    celda.append(mensaje, reintentar);
    fila.append(celda);
    regiones.filas.append(fila);
    regiones.estadoListado.textContent = "No se pudo completar la consulta.";
    return;
  }

  if (!estado.usuarios.length) {
    const fila = crearElemento("tr", { clase: "admin-usuarios__fila-estado" });
    const celda = crearElemento("td", { atributos: { colspan: "7" } });
    const vacio = crearElemento("div", { clase: "admin-usuarios__vacio" });
    const icono = crearElemento("span", { clase: "admin-usuarios__vacio-icono" });
    icono.append(crearIcono("usuarios"));
    vacio.append(
      icono,
      crearElemento("strong", { texto: estado.busqueda ? "No encontramos coincidencias" : "Todavía no hay usuarios registrados" }),
      crearElemento("p", { texto: estado.busqueda ? "Prueba con otro nombre o correo electrónico." : "Cuando se registren cuentas de usuario, aparecerán en este listado." })
    );
    celda.append(vacio);
    fila.append(celda);
    regiones.filas.append(fila);
    regiones.estadoListado.textContent = estado.busqueda ? "No hay resultados para esta búsqueda." : "No hay cuentas para mostrar.";
    return;
  }

  const fragmento = document.createDocumentFragment();
  for (const usuario of estado.usuarios) fragmento.append(crearFilaUsuario(usuario));
  regiones.filas.append(fragmento);
  regiones.estadoListado.textContent = estado.totalRegistros === null
    ? `${estado.usuarios.length} cuentas en esta página.`
    : `${formatearCantidad(estado.totalRegistros)} cuentas encontradas.`;
}

/** Crea una fila de usuario con acciones explícitas, accesibles y sin HTML remoto. */
function crearFilaUsuario(usuario) {
  const fila = crearElemento("tr", { clase: "admin-usuarios__fila" });
  const celdaUsuario = crearElemento("td");
  const identidad = crearElemento("div", { clase: "admin-usuarios__identidad" });
  const avatar = crearElemento("span", { clase: "admin-usuarios__avatar", atributos: { "aria-hidden": "true" } });
  const foto = obtenerFotoSegura(usuario.foto_url);
  if (foto) {
    const imagen = crearElemento("img", { atributos: { src: foto, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => avatar.replaceChildren(document.createTextNode(iniciales(usuario.nombre_completo))));
    avatar.append(imagen);
  } else {
    avatar.textContent = iniciales(usuario.nombre_completo);
  }
  const nombre = crearElemento("div", { clase: "admin-usuarios__identidad-texto" });
  nombre.append(crearElemento("strong", { texto: usuario.nombre_completo || "Nombre no disponible" }));
  identidad.append(avatar, nombre);
  celdaUsuario.append(identidad);

  const celdaCorreo = crearElemento("td", { texto: usuario.correo || "No registrado" });
  const celdaTelefono = crearElemento("td", { texto: usuario.telefono || "No registrado" });
  const activo = usuario.activo === true || Number(usuario.activo) === 1;
  const celdaEstado = crearElemento("td");
  celdaEstado.append(crearElemento("span", {
    clase: `admin-usuarios__estado ${activo ? "admin-usuarios__estado--activo" : "admin-usuarios__estado--inactivo"}`,
    texto: activo ? "Activo" : "Inactivo"
  }));
  const celdaFecha = crearElemento("td", { texto: formatearFecha(usuario.creado_en) });
  const cantidad = usuario.cantidad_mascotas ?? usuario.numero_mascotas;
  const celdaMascotas = crearElemento("td", { texto: formatearCantidad(cantidad) });
  const celdaAcciones = crearElemento("td");
  const acciones = crearElemento("div", { clase: "admin-usuarios__acciones-fila" });
  const detalle = crearElemento("button", { clase: "admin-usuarios__accion-detalle", texto: "Ver detalle", atributos: { type: "button" } });
  detalle.addEventListener("click", () => abrirDetalleUsuario(usuario, detalle));
  const cambiarEstado = crearElemento("button", {
    clase: `admin-usuarios__accion-estado ${activo ? "admin-usuarios__accion-estado--desactivar" : "admin-usuarios__accion-estado--activar"}`,
    texto: activo ? "Desactivar" : "Activar",
    atributos: { type: "button", "aria-label": `${activo ? "Desactivar" : "Activar"} cuenta de ${textoSeguro(usuario.nombre_completo)}` }
  });
  cambiarEstado.addEventListener("click", () => abrirConfirmacionEstado(usuario, cambiarEstado));
  acciones.append(detalle, cambiarEstado);
  celdaAcciones.append(acciones);
  fila.append(celdaUsuario, celdaCorreo, celdaTelefono, celdaEstado, celdaFecha, celdaMascotas, celdaAcciones);
  return fila;
}

/** Abre el diálogo de confirmación y deja preparada la operación, sin modificar aún el estado. */
function abrirConfirmacionEstado(usuario, botonOrigen) {
  const activo = usuario.activo === true || Number(usuario.activo) === 1;
  estado.usuarioSeleccionado = usuario;
  const { dialogo, descripcion, error, confirmar } = estado.regiones.dialogoConfirmacion;
  descripcion.textContent = activo
    ? `¿Deseas desactivar la cuenta de ${textoSeguro(usuario.nombre_completo)}? La persona dejará de poder acceder a PetCare.`
    : `¿Deseas activar nuevamente la cuenta de ${textoSeguro(usuario.nombre_completo)}?`;
  confirmar.textContent = activo ? "Sí, desactivar" : "Sí, activar";
  confirmar.className = activo ? "boton boton--peligro" : "boton";
  confirmar.disabled = false;
  error.textContent = "";
  error.hidden = true;
  estado.regiones.dialogoConfirmacion.botonOrigen = botonOrigen;
  dialogo.showModal();
}

/** Envía el cambio de estado después de que el administrador lo confirma. */
async function confirmarCambioEstado() {
  const regiones = estado.regiones.dialogoConfirmacion;
  const usuario = estado.usuarioSeleccionado;
  if (!usuario || estado.actualizandoUsuarioId !== null) return;

  const activoActual = usuario.activo === true || Number(usuario.activo) === 1;
  estado.actualizandoUsuarioId = usuario.id;
  regiones.confirmar.disabled = true;
  regiones.cancelar.disabled = true;
  regiones.confirmar.textContent = "Guardando…";
  regiones.error.hidden = true;

  try {
    await api.admin.cambiarEstadoUsuario(usuario.id, !activoActual);
    regiones.dialogo.close();
    mostrarAviso(activoActual ? "La cuenta se desactivó correctamente." : "La cuenta se activó correctamente.");
    await cargarUsuarios();
  } catch (error) {
    regiones.error.textContent = obtenerMensajeError(error, "No fue posible actualizar el estado de la cuenta.");
    regiones.error.hidden = false;
  } finally {
    estado.actualizandoUsuarioId = null;
    regiones.confirmar.disabled = false;
    regiones.cancelar.disabled = false;
    regiones.confirmar.textContent = activoActual ? "Sí, desactivar" : "Sí, activar";
  }
}

/** Abre el detalle, consulta las mascotas en el servidor y actualiza los enlaces a módulos futuros. */
async function abrirDetalleUsuario(usuario, botonOrigen) {
  estado.usuarioSeleccionado = usuario;
  estado.ultimoBotonDetalle = botonOrigen;
  const regiones = estado.regiones.dialogoDetalle;
  const id = encodeURIComponent(String(usuario.id));
  regiones.agendar.href = `${RUTAS.citas}?usuario_id=${id}`;
  regiones.carnet.href = `${RUTAS.vacunas}?usuario_id=${id}`;
  renderizarPerfilDetalle(usuario);
  estado.mascotasUsuario = [];
  estado.errorDetalle = null;
  estado.cargandoDetalle = true;
  regiones.dialogo.showModal();
  renderizarMascotasDetalle();
  try {
    await cargarDetalleUsuario(usuario, { mantenerDialogo: true });
  } finally {
    if (regiones.dialogo.open) regiones.dialogo.querySelector(".admin-usuarios-detalle__cerrar")?.focus();
  }
}

/** Recupera las mascotas del usuario seleccionado. La secuencia evita reemplazar un detalle más reciente. */
async function cargarDetalleUsuario(usuario, { mantenerDialogo = false } = {}) {
  const secuencia = ++estado.secuenciaDetalle;
  estado.usuarioSeleccionado = usuario;
  estado.cargandoDetalle = true;
  estado.errorDetalle = null;
  if (mantenerDialogo && !estado.regiones.dialogoDetalle.dialogo.open) {
    estado.regiones.dialogoDetalle.dialogo.showModal();
  }
  renderizarMascotasDetalle();

  try {
    const respuesta = await api.admin.obtenerMascotasUsuario(usuario.id);
    if (secuencia !== estado.secuenciaDetalle) return;
    estado.mascotasUsuario = obtenerDatos(respuesta);
  } catch (error) {
    if (secuencia !== estado.secuenciaDetalle) return;
    estado.errorDetalle = error;
    estado.mascotasUsuario = [];
  } finally {
    if (secuencia === estado.secuenciaDetalle) {
      estado.cargandoDetalle = false;
      renderizarMascotasDetalle();
    }
  }
}

/** Dibuja la identidad, el rol y la información de contacto del usuario seleccionado. */
function renderizarPerfilDetalle(usuario) {
  const regiones = estado.regiones.dialogoDetalle;
  const perfil = crearElemento("div", { clase: "admin-usuarios-detalle__identidad" });
  const avatar = crearElemento("span", { clase: "admin-usuarios-detalle__avatar", atributos: { "aria-hidden": "true" } });
  const foto = obtenerFotoSegura(usuario.foto_url);
  if (foto) {
    const imagen = crearElemento("img", { atributos: { src: foto, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => avatar.replaceChildren(document.createTextNode(iniciales(usuario.nombre_completo))));
    avatar.append(imagen);
  } else {
    avatar.textContent = iniciales(usuario.nombre_completo);
  }
  const texto = crearElemento("div", { clase: "admin-usuarios-detalle__identidad-texto" });
  texto.append(
    crearElemento("h3", { texto: usuario.nombre_completo || "Nombre no disponible" }),
    crearElemento("p", { texto: usuario.correo || "Correo no registrado" }),
    crearElemento("span", { clase: "admin-usuarios-detalle__rol", texto: "Usuario" })
  );
  perfil.append(avatar, texto);

  const datos = crearElemento("dl", { clase: "admin-usuarios-detalle__datos" });
  const campos = [
    ["Teléfono", usuario.telefono || "No registrado"],
    ["Ciudad", usuario.ciudad || "No registrada"],
    ["País", usuario.pais || "No registrado"],
    ["Fecha de registro", formatearFecha(usuario.creado_en)]
  ];
  for (const [etiqueta, valor] of campos) {
    const grupo = crearElemento("div");
    grupo.append(crearElemento("dt", { texto: etiqueta }), crearElemento("dd", { texto: valor }));
    datos.append(grupo);
  }
  perfil.append(datos);
  regiones.perfil.replaceChildren(perfil);
}

/** Presenta carga, error, vacío o tarjetas de las mascotas reales del usuario. */
function renderizarMascotasDetalle() {
  const regiones = estado.regiones.dialogoDetalle;
  regiones.mascotas.replaceChildren();
  regiones.mensajeError.hidden = true;
  regiones.reintentar.hidden = true;

  if (estado.cargandoDetalle) {
    regiones.mascotas.append(crearElemento("p", { clase: "admin-usuarios-detalle__estado", texto: "Consultando las mascotas…", atributos: { role: "status" } }));
    regiones.contador.textContent = "…";
    return;
  }
  if (estado.errorDetalle) {
    regiones.mascotas.append(crearElemento("p", { clase: "admin-usuarios-detalle__estado", texto: "No pudimos cargar las mascotas de esta cuenta." }));
    regiones.mensajeError.textContent = obtenerMensajeError(estado.errorDetalle, "Comprueba la conexión e inténtalo nuevamente.");
    regiones.mensajeError.hidden = false;
    regiones.reintentar.hidden = false;
    regiones.contador.textContent = "—";
    return;
  }
  regiones.contador.textContent = formatearCantidad(estado.mascotasUsuario.length);
  if (!estado.mascotasUsuario.length) {
    regiones.mascotas.append(crearElemento("p", { clase: "admin-usuarios-detalle__estado", texto: "Este usuario todavía no tiene mascotas registradas." }));
    return;
  }

  const fragmento = document.createDocumentFragment();
  for (const mascota of estado.mascotasUsuario) fragmento.append(crearTarjetaMascota(mascota));
  regiones.mascotas.append(fragmento);
}

/** Crea una tarjeta compacta con los campos de MASCOTAS y los alias de catálogo disponibles. */
function crearTarjetaMascota(mascota) {
  const tarjeta = crearElemento("article", { clase: "admin-usuarios-detalle__mascota" });
  const encabezado = crearElemento("div", { clase: "admin-usuarios-detalle__mascota-encabezado" });
  const identidad = crearElemento("div", { clase: "admin-usuarios-detalle__mascota-identidad" });
  const icono = crearElemento("span", { clase: "admin-usuarios-detalle__mascota-icono" });
  const foto = obtenerFotoSegura(mascota.foto_url);
  if (foto) {
    const imagen = crearElemento("img", { atributos: { src: foto, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => icono.replaceChildren(crearIcono("mascota")));
    icono.append(imagen);
  } else {
    icono.append(crearIcono("mascota"));
  }
  identidad.append(icono, crearElemento("strong", { texto: mascota.nombre || "Nombre no disponible" }));
  const activa = mascota.activa === true || Number(mascota.activa) === 1;
  encabezado.append(
    identidad,
    crearElemento("span", { clase: `admin-usuarios-detalle__mascota-estado ${activa ? "admin-usuarios-detalle__mascota-estado--activa" : "admin-usuarios-detalle__mascota-estado--inactiva"}`, texto: activa ? "Activa" : "Inactiva" })
  );
  const datos = crearElemento("div", { clase: "admin-usuarios-detalle__mascota-datos" });
  const especie = mascota.nombre_especie || "Especie no registrada";
  const raza = mascota.nombre_raza || (mascota.raza_id ? "Raza no disponible" : "Sin raza registrada");
  const sexo = mascota.sexo === "macho" ? "Macho" : mascota.sexo === "hembra" ? "Hembra" : "Sexo no registrado";
  const salud = {
    excelente: "Excelente",
    bueno: "Bueno",
    requiere_atencion: "Requiere atención"
  }[mascota.estado_salud] || "Estado no registrado";
  for (const [etiqueta, valor] of [["Especie", especie], ["Raza", raza], ["Sexo", sexo], ["Salud", salud]]) {
    const grupo = crearElemento("div");
    grupo.append(crearElemento("span", { texto: etiqueta }), crearElemento("strong", { texto: valor }));
    datos.append(grupo);
  }
  tarjeta.append(encabezado, datos);
  return tarjeta;
}

/** Presenta un aviso breve después de una operación confirmada por el servidor. */
function mostrarAviso(mensaje) {
  const aviso = estado.regiones.aviso;
  aviso.textContent = mensaje;
  aviso.hidden = false;
  if (estado.temporizadorAviso) window.clearTimeout(estado.temporizadorAviso);
  estado.temporizadorAviso = window.setTimeout(() => {
    aviso.hidden = true;
    aviso.textContent = "";
    estado.temporizadorAviso = null;
  }, 4500);
}

/** Obtiene un mensaje legible de la respuesta estándar { error, campos }. */
function obtenerMensajeError(error, alternativo) {
  if (error instanceof ApiError) return error.error || error.message || alternativo;
  return error?.message || alternativo;
}

/** Inicia la página después de validar la sesión y exigir rol administrador. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!estado.sesion) return;

    let aplicarBusquedaGlobal = () => {};
    estado.layout = montarLayout({
      contenedor,
      sesion: estado.sesion,
      titulo: "Usuarios",
      paginaActual: "/admin-usuarios.html",
      onBuscar: (termino) => aplicarBusquedaGlobal(termino)
    });
    estado.regiones = construirPagina(estado.layout.contenido);
    aplicarBusquedaGlobal = (termino) => {
      estado.regiones.campoBusqueda.value = termino;
      aplicarBusqueda(termino);
    };
    contenedor.setAttribute("aria-busy", "false");
    await cargarUsuarios();
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    mostrarErrorInicial(contenedor, error);
  }
}

/** Muestra un fallo de inicialización sin ocultar el motivo ni inventar datos. */
function mostrarErrorInicial(contenedor, error) {
  const tarjeta = crearElemento("section", { clase: "admin-usuarios__error-inicial" });
  tarjeta.append(
    crearElemento("h1", { texto: "No pudimos abrir la administración" }),
    crearElemento("p", { texto: obtenerMensajeError(error, "Ocurrió un error al validar tu sesión o preparar la página.") })
  );
  const reintentar = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", () => window.location.reload());
  tarjeta.append(reintentar);
  contenedor.replaceChildren(tarjeta);
}

iniciar();
