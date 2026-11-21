/**
 * Módulo Mi perfil.
 * Consulta y actualiza la información pública del usuario autenticado mediante js/api.js.
 * No lee ni modifica credenciales, roles ni identificadores de propietario desde el navegador.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { formatearFecha, iniciales, textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  inicio: "/inicio.html",
  configuracion: "/configuracion.html",
  notificaciones: "/notificaciones.html"
};
const MAXIMO_AVATAR_BYTES = 4 * 1024 * 1024;
const TIPOS_AVATAR = new Set(["image/jpeg", "image/png", "image/webp"]);

const estado = {
  sesion: null,
  layout: null,
  perfil: null,
  pagina: null,
  formulario: null,
  cargando: false,
  editando: false,
  guardando: false,
  foto: null,
  fotoTemporalUrl: null,
  error: null
};

/** Crea elementos con atributos explícitos y texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Añade un campo de lectura de forma consistente. */
function crearDato(etiqueta, valor, clase = "") {
  const bloque = crearElemento("div", { clase: `perfil-dato ${clase}`.trim() });
  bloque.append(
    crearElemento("span", { clase: "perfil-dato__etiqueta", texto: etiqueta }),
    crearElemento("strong", { clase: "perfil-dato__valor", texto: valor || "No registrado" })
  );
  return bloque;
}

/** Acepta únicamente fotos HTTPS o recursos del mismo origen. */
function obtenerFotoSegura(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor, window.location.origin);
    if (url.protocol === "https:" || url.origin === window.location.origin) return url.href;
  } catch {
    return null;
  }
  return null;
}

/** Prepara el avatar de respaldo o la fotografía actual del usuario. */
function actualizarAvatar() {
  const contenedor = estado.pagina?.avatar;
  if (!contenedor || !estado.perfil) return;
  contenedor.replaceChildren();
  const ruta = estado.fotoTemporalUrl || obtenerFotoSegura(estado.perfil.foto_url);
  if (ruta) {
    const imagen = crearElemento("img", {
      atributos: { src: ruta, alt: `Foto de perfil de ${estado.perfil.nombre_completo || "usuario"}`, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }
    });
    imagen.addEventListener("error", () => {
      contenedor.replaceChildren(crearElemento("span", { texto: iniciales(estado.perfil?.nombre_completo) }));
    }, { once: true });
    contenedor.append(imagen);
  } else {
    contenedor.append(crearElemento("span", { texto: iniciales(estado.perfil.nombre_completo) }));
  }
}

/** Normaliza el nombre del rol sin exponer valores desconocidos como etiquetas confiables. */
function etiquetaRol(rol) {
  if (rol === "administrador") return "Administrador";
  if (rol === "usuario") return "Usuario";
  return "Cuenta";
}

/** Construye la página completa dentro del layout compartido. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "perfil-pagina" });
  const introduccion = crearElemento("header", { clase: "perfil-intro" });
  introduccion.append(
    crearElemento("p", { clase: "perfil-intro__sobrelinea", texto: "Tu cuenta PetCare" }),
    crearElemento("h2", { texto: "Mi perfil" }),
    crearElemento("p", { texto: "Mantén tus datos personales actualizados y encuentra rápidamente los ajustes de tu cuenta." })
  );

  const hero = crearElemento("section", { clase: "perfil-resumen tarjeta", atributos: { "aria-label": "Resumen de tu perfil" } });
  const avatar = crearElemento("div", { clase: "perfil-avatar", atributos: { "aria-label": "Avatar del usuario" } });
  const datosHero = crearElemento("div", { clase: "perfil-resumen__datos" });
  const nombre = crearElemento("h3", { clase: "perfil-resumen__nombre", texto: "Cargando perfil…" });
  const correo = crearElemento("p", { clase: "perfil-resumen__correo" });
  const rol = crearElemento("span", { clase: "perfil-rol", texto: "Cuenta" });
  datosHero.append(nombre, correo, rol);
  const avatarAccion = crearElemento("button", { clase: "boton boton--secundario perfil-avatar__accion", texto: "Cambiar foto", atributos: { type: "button" } });
  const inputFoto = crearElemento("input", { atributos: { type: "file", accept: "image/jpeg,image/png,image/webp", id: "perfil-foto", name: "foto", hidden: "" } });
  const resumenMiembro = crearElemento("p", { clase: "perfil-resumen__miembro" });
  const heroLateral = crearElemento("div", { clase: "perfil-resumen__lateral" });
  heroLateral.append(avatarAccion, resumenMiembro, inputFoto);
  avatarAccion.addEventListener("click", () => inputFoto.click());
  hero.append(avatar, datosHero, heroLateral);

  const tarjetaInfo = crearElemento("section", { clase: "tarjeta perfil-info", atributos: { "aria-labelledby": "perfil-info-titulo" } });
  const cabeceraInfo = crearElemento("div", { clase: "tarjeta__encabezado perfil-info__encabezado" });
  cabeceraInfo.append(
    crearElemento("div", { texto: "" }),
    crearElemento("button", { clase: "boton boton--secundario", texto: "Editar", atributos: { type: "button", id: "perfil-editar" } })
  );
  cabeceraInfo.firstElementChild.append(
    crearElemento("h3", { clase: "tarjeta__titulo", texto: "Información personal", atributos: { id: "perfil-info-titulo" } }),
    crearElemento("p", { clase: "perfil-info__ayuda", texto: "Los datos que utilizas en tu cuenta." })
  );
  const lectura = crearElemento("div", { clase: "perfil-info__grid", atributos: { id: "perfil-info-lectura" } });

  const formulario = crearElemento("form", { clase: "perfil-formulario formulario", atributos: { id: "perfil-formulario", hidden: "" } });
  const campos = crearElemento("div", { clase: "perfil-formulario__grid" });
  const campoNombre = crearCampo("Nombre completo", "nombre_completo", "text", { required: true, maxLength: 120, autocomplete: "name" });
  const campoCorreo = crearCampo("Correo electrónico", "correo", "email", { required: true, maxLength: 150, autocomplete: "email" });
  const campoTelefono = crearCampo("Teléfono", "telefono", "tel", { maxLength: 25, autocomplete: "tel" });
  const campoCiudad = crearCampo("Ciudad", "ciudad", "text", { maxLength: 100, autocomplete: "address-level2" });
  const campoPais = crearCampo("País (código de 2 letras)", "pais", "text", { maxLength: 2, autocomplete: "country", placeholder: "CO" });
  campos.append(campoNombre.bloque, campoCorreo.bloque, campoTelefono.bloque, campoCiudad.bloque, campoPais.bloque);
  const mensajeFormulario = crearElemento("p", { clase: "perfil-formulario__mensaje", atributos: { role: "status", "aria-live": "polite", hidden: "" } });
  const accionesFormulario = crearElemento("div", { clase: "perfil-formulario__acciones" });
  const cancelar = crearElemento("button", { clase: "boton boton--secundario", texto: "Cancelar", atributos: { type: "button", id: "perfil-cancelar" } });
  const guardar = crearElemento("button", { clase: "boton", texto: "Guardar cambios", atributos: { type: "submit" } });
  accionesFormulario.append(cancelar, guardar);
  formulario.append(campos, accionesFormulario);
  tarjetaInfo.append(cabeceraInfo, mensajeFormulario, lectura, formulario);

  const accesos = crearElemento("section", { clase: "perfil-accesos", atributos: { "aria-label": "Accesos de tu cuenta" } });
  accesos.append(
    crearAcceso("Cambiar contraseña", "Actualiza tu clave de acceso.", RUTAS.configuracion + "#seguridad", "seguridad"),
    crearAcceso("Configuración", "Administra notificaciones y privacidad.", RUTAS.configuracion, "ajustes"),
    crearAcceso("Notificaciones", "Consulta los avisos de tu cuenta.", RUTAS.notificaciones, "campana")
  );

  const estadoCarga = crearElemento("div", { clase: "perfil-estado", texto: "Consultando tu información…", atributos: { role: "status", id: "perfil-estado-carga" } });
  pagina.append(introduccion, estadoCarga, hero, tarjetaInfo, accesos);
  contenedor.replaceChildren(pagina);

  const controles = {
    nombre: campoNombre.input,
    correo: campoCorreo.input,
    telefono: campoTelefono.input,
    ciudad: campoCiudad.input,
    pais: campoPais.input,
    mensaje: mensajeFormulario,
    botonGuardar: guardar,
    botonEditar: cabeceraInfo.querySelector("#perfil-editar"),
    botonCancelar: cancelar
  };

  controles.botonEditar.addEventListener("click", iniciarEdicion);
  controles.botonCancelar.addEventListener("click", cancelarEdicion);
  formulario.addEventListener("submit", guardarPerfil);
  inputFoto.addEventListener("change", seleccionarFoto);

  return { pagina, hero, avatar, nombre, correo, rol, resumenMiembro, estadoCarga, lectura, formulario, controles, inputFoto };
}

/** Crea un campo de formulario con etiqueta visible y control accesible. */
function crearCampo(etiqueta, nombre, tipo, opciones = {}) {
  const bloque = crearElemento("div", { clase: "campo perfil-campo" });
  const id = `perfil-campo-${nombre}`;
  const label = crearElemento("label", { clase: "campo__etiqueta", texto: etiqueta, atributos: { for: id } });
  const input = crearElemento("input", {
    clase: "campo__control",
    atributos: { id, name: nombre, type: tipo, ...opciones }
  });
  const error = crearElemento("small", { clase: "campo__ayuda", atributos: { id: `${id}-ayuda`, "data-error-for": nombre } });
  input.setAttribute("aria-describedby", error.id);
  bloque.append(label, input, error);
  return { bloque, input };
}

/** Crea uno de los accesos secundarios de perfil. */
function crearAcceso(titulo, descripcion, destino, icono) {
  const enlace = crearElemento("a", { clase: "perfil-acceso tarjeta", atributos: { href: destino } });
  const simbolo = crearElemento("span", { clase: `perfil-acceso__icono perfil-acceso__icono--${icono}`, atributos: { "aria-hidden": "true" } });
  const iconos = {
    seguridad: "⌘",
    ajustes: "⚙",
    campana: "♧"
  };
  simbolo.textContent = iconos[icono] || "•";
  const contenido = crearElemento("span", { clase: "perfil-acceso__contenido" });
  contenido.append(crearElemento("strong", { texto: titulo }), crearElemento("small", { texto: descripcion }));
  enlace.append(simbolo, contenido, crearElemento("span", { clase: "perfil-acceso__flecha", texto: "›", atributos: { "aria-hidden": "true" } }));
  return enlace;
}

/** Actualiza los datos visibles sin reconstruir los controles de edición. */
function renderizarPerfil() {
  const perfil = estado.perfil;
  if (!perfil || !estado.pagina) return;
  const datos = [
    ["Nombre completo", perfil.nombre_completo],
    ["Correo electrónico", perfil.correo],
    ["Teléfono", perfil.telefono],
    ["Ciudad", perfil.ciudad],
    ["País", perfil.pais]
  ];
  estado.pagina.lectura.replaceChildren(...datos.map(([etiqueta, valor]) => crearDato(etiqueta, valor)));
  estado.pagina.nombre.textContent = perfil.nombre_completo || "Mi perfil";
  estado.pagina.correo.textContent = perfil.correo || "Correo no registrado";
  estado.pagina.rol.textContent = etiquetaRol(perfil.rol);
  estado.pagina.resumenMiembro.textContent = perfil.creado_en ? `Miembro desde ${formatearFecha(perfil.creado_en)}` : "Fecha de registro no disponible";
  actualizarAvatar();

  const formulario = estado.pagina.formulario;
  const { nombre, correo, telefono, ciudad, pais } = estado.pagina.controles;
  nombre.value = perfil.nombre_completo || "";
  correo.value = perfil.correo || "";
  telefono.value = perfil.telefono || "";
  ciudad.value = perfil.ciudad || "";
  pais.value = perfil.pais || "";
  formulario.hidden = !estado.editando;
  estado.pagina.lectura.hidden = estado.editando;
  estado.pagina.controles.botonEditar.hidden = estado.editando;
  estado.pagina.estadoCarga.hidden = true;
}

/** Activa el formulario de edición y sitúa el foco en el primer campo. */
function iniciarEdicion() {
  if (estado.guardando || !estado.perfil) return;
  estado.editando = true;
  limpiarMensajeFormulario();
  renderizarPerfil();
  estado.pagina.controles.nombre.focus();
}

/** Descarta los cambios locales de texto y fotografía que no se han enviado. */
function cancelarEdicion() {
  if (estado.guardando) return;
  estado.editando = false;
  limpiarFotoTemporal();
  limpiarMensajeFormulario();
  renderizarPerfil();
}

/** Limpia una URL temporal de vista previa para liberar memoria. */
function limpiarFotoTemporal() {
  if (estado.fotoTemporalUrl) URL.revokeObjectURL(estado.fotoTemporalUrl);
  estado.fotoTemporalUrl = null;
  estado.foto = null;
  if (estado.pagina?.inputFoto) estado.pagina.inputFoto.value = "";
}

/** Valida formato y tamaño de la imagen antes de preparar su envío al servidor. */
function seleccionarFoto(evento) {
  const archivo = evento.currentTarget.files?.[0];
  if (!archivo) return;
  if (!estado.editando) {
    estado.editando = true;
    renderizarPerfil();
  }
  if (!TIPOS_AVATAR.has(archivo.type)) {
    mostrarMensajeFormulario("Selecciona una imagen JPG, PNG o WebP.", true);
    evento.currentTarget.value = "";
    return;
  }
  if (archivo.size > MAXIMO_AVATAR_BYTES) {
    mostrarMensajeFormulario("La imagen debe pesar máximo 4 MB.", true);
    evento.currentTarget.value = "";
    return;
  }
  limpiarFotoTemporal();
  estado.foto = archivo;
  estado.fotoTemporalUrl = URL.createObjectURL(archivo);
  actualizarAvatar();
  mostrarMensajeFormulario("Foto seleccionada. Guarda los cambios para actualizar tu avatar.");
}

/** Convierte la fotografía elegida en el objeto JSON que recibirá el backend. */
async function prepararFoto(archivo) {
  if (!archivo) return undefined;
  const contenido = await new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.addEventListener("load", () => resolver(String(lector.result || "")), { once: true });
    lector.addEventListener("error", () => rechazar(new Error("No se pudo leer la fotografía seleccionada.")), { once: true });
    lector.readAsDataURL(archivo);
  });
  const separador = contenido.indexOf(",");
  if (separador < 0) throw new Error("El archivo seleccionado no pudo convertirse.");
  return { nombre: archivo.name, tipo: archivo.type, contenido_base64: contenido.slice(separador + 1) };
}

/** Muestra un mensaje del formulario con estado de error o confirmación. */
function mostrarMensajeFormulario(mensaje, error = false) {
  const region = estado.pagina?.controles.mensaje;
  if (!region) return;
  region.textContent = mensaje;
  region.classList.toggle("es-error", error);
  region.hidden = false;
}

/** Vacía los avisos y errores vinculados al formulario. */
function limpiarMensajeFormulario() {
  const region = estado.pagina?.controles.mensaje;
  if (!region) return;
  region.textContent = "";
  region.hidden = true;
  region.classList.remove("es-error");
  estado.pagina.formulario.querySelectorAll("[aria-invalid='true']").forEach((campo) => campo.removeAttribute("aria-invalid"));
}

/** Normaliza el formato de errores de campo del servidor. */
function mostrarErroresServidor(error) {
  const campos = error instanceof ApiError ? error.campos : {};
  const equivalencias = { nombre: "nombre_completo", email: "correo", telefono: "telefono", ciudad: "ciudad", pais: "pais" };
  let cantidad = 0;
  for (const [nombre, valor] of Object.entries(campos || {})) {
    const clave = equivalencias[nombre] || nombre;
    const control = estado.pagina.formulario.elements.namedItem(clave);
    const ayuda = estado.pagina.formulario.querySelector(`[data-error-for="${CSS.escape(clave)}"]`);
    const mensaje = Array.isArray(valor) ? valor.join(" ") : typeof valor === "string" ? valor : "Revisa este campo.";
    if (control && ayuda) {
      control.setAttribute("aria-invalid", "true");
      ayuda.textContent = mensaje;
      cantidad += 1;
    }
  }
  return cantidad;
}

/** Envía los datos personales en una única petición y evita envíos duplicados. */
async function guardarPerfil(evento) {
  evento.preventDefault();
  if (estado.guardando || !estado.perfil) return;
  const formulario = estado.pagina.formulario;
  if (!formulario.reportValidity()) return;

  const { nombre, correo, telefono, ciudad, pais, botonGuardar, botonCancelar, botonEditar } = estado.pagina.controles;
  const datos = {
    nombre_completo: nombre.value.trim(),
    correo: correo.value.trim(),
    telefono: telefono.value.trim() || null,
    ciudad: ciudad.value.trim() || null,
    pais: pais.value.trim().toUpperCase() || null
  };
  if (datos.pais && !/^[A-Z]{2}$/.test(datos.pais)) {
    pais.setAttribute("aria-invalid", "true");
    mostrarMensajeFormulario("El país debe indicarse con su código de dos letras.", true);
    pais.focus();
    return;
  }

  estado.guardando = true;
  botonGuardar.disabled = true;
  botonCancelar.disabled = true;
  botonEditar.disabled = true;
  botonGuardar.textContent = "Guardando…";
  limpiarMensajeFormulario();

  try {
    const foto = await prepararFoto(estado.foto);
    if (foto) datos.foto = foto;
    const respuesta = await api.perfil.actualizar(datos);
    if (!respuesta?.perfil) throw new Error("El servidor no devolvió el perfil actualizado.");
    estado.perfil = respuesta.perfil;
    estado.sesion = { ...estado.sesion, usuario: { ...estado.sesion.usuario, ...respuesta.perfil } };
    estado.editando = false;
    limpiarFotoTemporal();
    renderizarPerfil();
    estado.layout?.actualizarUsuario(estado.perfil);
    mostrarMensajeFormulario("Tu información personal se actualizó correctamente.");
  } catch (error) {
    const tieneCampos = mostrarErroresServidor(error);
    mostrarMensajeFormulario(error instanceof ApiError ? error.error || error.message : error.message || "No fue posible guardar los cambios.", true);
    if (!tieneCampos) estado.pagina.controles.nombre.focus();
  } finally {
    estado.guardando = false;
    botonGuardar.disabled = false;
    botonCancelar.disabled = false;
    botonEditar.disabled = false;
    botonGuardar.textContent = "Guardar cambios";
  }
}

/** Consulta el perfil real, sin sustituir errores por datos locales de ejemplo. */
async function cargarPerfil() {
  estado.cargando = true;
  estado.pagina.estadoCarga.hidden = false;
  estado.pagina.estadoCarga.textContent = "Consultando tu información…";
  try {
    const respuesta = await api.perfil.obtener();
    if (!respuesta?.perfil) throw new Error("El servidor no devolvió los datos del perfil.");
    estado.perfil = respuesta.perfil;
    estado.error = null;
    renderizarPerfil();
  } catch (error) {
    estado.error = error;
    estado.pagina.estadoCarga.replaceChildren(
      crearElemento("strong", { texto: "No pudimos cargar tu perfil" }),
      crearElemento("span", { texto: error instanceof ApiError ? error.error || error.message : error.message || "Comprueba tu conexión e inténtalo nuevamente." }),
      crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } })
    );
    estado.pagina.estadoCarga.querySelector("button").addEventListener("click", cargarPerfil);
    estado.pagina.estadoCarga.hidden = false;
  } finally {
    estado.cargando = false;
  }
}

/** Presenta un error de sesión o de montaje con una acción de recuperación. */
function mostrarErrorInicial(contenedor, error) {
  const tarjeta = crearElemento("section", { clase: "perfil-error tarjeta" });
  tarjeta.append(
    crearElemento("h2", { texto: "No pudimos abrir tu perfil" }),
    crearElemento("p", { texto: error instanceof ApiError ? error.error || error.message : error?.message || "Ocurrió un error al validar tu sesión." }),
    crearElemento("a", { clase: "boton boton--secundario", texto: "Volver al inicio", atributos: { href: RUTAS.inicio } })
  );
  contenedor.replaceChildren(tarjeta);
  contenedor.setAttribute("aria-busy", "false");
}

/** Valida sesión, monta el layout y carga los datos de perfil desde el servidor. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["usuario", "administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!estado.sesion) return;
    estado.layout = montarLayout({ contenedor, sesion: estado.sesion, titulo: "Mi perfil", paginaActual: "/perfil.html" });
    estado.pagina = construirPagina(estado.layout.contenido);
    await cargarPerfil();
    contenedor.setAttribute("aria-busy", "false");
  } catch (error) {
    mostrarErrorInicial(contenedor, error);
  }
}

iniciar();
