/**
 * Módulo Configuración.
 * Administra exclusivamente columnas existentes de CONFIGURACION_USUARIO y operaciones de cuenta del servidor.
 * Cada interruptor guarda su propio cambio y revierte el estado visual cuando el servidor rechaza la petición.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina, limpiarEstadoLocal } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html" };
const PESTANAS = ["cuenta", "notificaciones", "privacidad", "seguridad"];

const PREFERENCIAS_NOTIFICACION = [
  { campo: "confirmacion_cita", titulo: "Confirmación de cita", descripcion: "Recibe un aviso cuando una cita veterinaria quede confirmada.", icono: "calendario" },
  { campo: "recordatorio_cita_24h", titulo: "Recordatorio de cita 24 horas antes", descripcion: "Recibe un aviso el día anterior a una cita programada.", icono: "reloj" },
  { campo: "notificaciones_push", titulo: "Notificaciones push", descripcion: "Permite recibir avisos del navegador cuando estén disponibles.", icono: "campana" },
  { campo: "notificaciones_correo", titulo: "Notificaciones por correo", descripcion: "Recibe comunicaciones de PetCare en tu correo registrado.", icono: "correo" },
  { campo: "actualizaciones_petcare", titulo: "Actualizaciones de PetCare", descripcion: "Recibe novedades y comunicaciones generales del servicio.", icono: "novedad" }
];

const PREFERENCIAS_PRIVACIDAD = [
  { campo: "perfil_publico", titulo: "Perfil público", descripcion: "Permite que la información de perfil definida por el servicio sea visible públicamente.", icono: "perfil" },
  { campo: "compartir_datos_anonimos", titulo: "Compartir datos anónimos", descripcion: "Autoriza el uso de datos desidentificados para análisis y mejora del servicio.", icono: "privacidad" }
];

const estado = {
  sesion: null,
  layout: null,
  perfil: null,
  preferencias: null,
  pagina: null,
  cargandoPreferencias: false,
  cargandoPerfil: false,
  guardandoCampos: new Set(),
  eliminandoCuenta: false,
  cambiandoContrasena: false,
  controlesCuenta: null,
  controlesNotificaciones: null,
  controlesPrivacidad: null,
  controlesSeguridad: null
};

/** Crea nodos de interfaz y asigna el contenido remoto siempre como texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Crea una pestaña accesible que controla un panel. */
function crearBotonPestana(clave, etiqueta) {
  return crearElemento("button", {
    clase: "config-tab",
    texto: etiqueta,
    atributos: { type: "button", role: "tab", id: `tab-${clave}`, "aria-controls": `panel-${clave}`, "aria-selected": "false", tabindex: "-1", "data-tab": clave }
  });
}

/** Crea un panel de pestaña y lo identifica para navegación accesible. */
function crearPanel(clave, etiqueta) {
  return crearElemento("section", {
    clase: "config-panel",
    atributos: { role: "tabpanel", id: `panel-${clave}`, "aria-labelledby": `tab-${clave}`, tabindex: "0", "data-panel": clave, hidden: "" }
  });
}

/** Construye los cuatro paneles y sus controles de cuenta. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "configuracion-pagina" });
  const intro = crearElemento("header", { clase: "configuracion-intro" });
  intro.append(
    crearElemento("p", { clase: "configuracion-intro__sobrelinea", texto: "Tu espacio, a tu manera" }),
    crearElemento("h2", { texto: "Configuración" }),
    crearElemento("p", { texto: "Administra cómo funciona tu cuenta, qué avisos recibes y cómo se comparten tus datos." })
  );

  const estadoGeneral = crearElemento("p", { clase: "configuracion-estado", atributos: { role: "status", "aria-live": "polite", hidden: "" } });
  const pestanas = crearElemento("div", { clase: "config-tabs", atributos: { role: "tablist", "aria-label": "Secciones de configuración" } });
  const botones = [
    crearBotonPestana("cuenta", "Cuenta"),
    crearBotonPestana("notificaciones", "Notificaciones"),
    crearBotonPestana("privacidad", "Privacidad"),
    crearBotonPestana("seguridad", "Seguridad")
  ];
  botones.forEach((boton) => {
    boton.addEventListener("click", () => seleccionarPestana(boton.dataset.tab, true));
    pestanas.append(boton);
  });
  pestanas.addEventListener("keydown", (evento) => {
    const indiceActual = botones.indexOf(document.activeElement);
    if (indiceActual < 0) return;
    let indiceSiguiente = indiceActual;
    if (evento.key === "ArrowRight") indiceSiguiente = (indiceActual + 1) % botones.length;
    else if (evento.key === "ArrowLeft") indiceSiguiente = (indiceActual - 1 + botones.length) % botones.length;
    else if (evento.key === "Home") indiceSiguiente = 0;
    else if (evento.key === "End") indiceSiguiente = botones.length - 1;
    else return;
    evento.preventDefault();
    botones[indiceSiguiente].focus();
    seleccionarPestana(botones[indiceSiguiente].dataset.tab, true);
  });

  const paneles = {
    cuenta: crearPanel("cuenta", "Cuenta"),
    notificaciones: crearPanel("notificaciones", "Notificaciones"),
    privacidad: crearPanel("privacidad", "Privacidad"),
    seguridad: crearPanel("seguridad", "Seguridad")
  };
  construirPanelCuenta(paneles.cuenta);
  construirPanelPreferencias(paneles.notificaciones, "notificaciones");
  construirPanelPreferencias(paneles.privacidad, "privacidad");
  construirPanelSeguridad(paneles.seguridad);

  const region = crearElemento("div", { clase: "configuracion-region" });
  Object.values(paneles).forEach((panel) => region.append(panel));
  pagina.append(intro, estadoGeneral, pestanas, region);
  contenedor.replaceChildren(pagina);

  return { pagina, pestanas, botones, paneles, estadoGeneral };
}

/** Crea el contenido de Cuenta y el formulario de confirmación de eliminación. */
function construirPanelCuenta(panel) {
  const tarjetaCuenta = crearElemento("section", { clase: "tarjeta config-tarjeta" });
  tarjetaCuenta.append(
    crearElemento("h3", { clase: "config-tarjeta__titulo", texto: "Información de tu cuenta" }),
    crearElemento("p", { clase: "config-tarjeta__descripcion", texto: "Tu correo se utiliza para confirmar que eres la persona titular antes de una eliminación." })
  );
  const correoActual = crearElemento("p", { clase: "config-cuenta__correo", texto: "Consultando correo de la cuenta…", atributos: { id: "config-correo-actual" } });
  tarjetaCuenta.append(correoActual);

  const peligro = crearElemento("section", { clase: "tarjeta config-peligro", atributos: { "aria-labelledby": "config-peligro-titulo" } });
  peligro.append(
    crearElemento("span", { clase: "config-peligro__sobrelinea", texto: "Zona de cuidado" }),
    crearElemento("h3", { clase: "config-tarjeta__titulo", texto: "Eliminar cuenta", atributos: { id: "config-peligro-titulo" } }),
    crearElemento("p", { texto: "Esta acción elimina tu cuenta y puede afectar la información relacionada según las reglas de la base de datos. No se puede deshacer." })
  );
  const formulario = crearElemento("form", { clase: "formulario config-eliminar-form", atributos: { id: "config-eliminar-form" } });
  const grupo = crearElemento("div", { clase: "campo" });
  const label = crearElemento("label", { clase: "campo__etiqueta", texto: "Escribe tu correo para confirmar", atributos: { for: "config-correo-confirmacion" } });
  const input = crearElemento("input", { clase: "campo__control", atributos: { type: "email", id: "config-correo-confirmacion", name: "correo_confirmacion", autocomplete: "email", required: "", disabled: "" } });
  const ayuda = crearElemento("small", { clase: "campo__ayuda", texto: "La dirección debe coincidir con el correo de tu cuenta." });
  grupo.append(label, input, ayuda);
  const mensaje = crearElemento("p", { clase: "config-form__mensaje", atributos: { role: "status", "aria-live": "polite", hidden: "" } });
  const boton = crearElemento("button", { clase: "boton boton--peligro", texto: "Eliminar mi cuenta", atributos: { type: "submit", disabled: "" } });
  formulario.append(grupo, mensaje, boton);
  formulario.addEventListener("input", validarCorreoConfirmacion);
  formulario.addEventListener("submit", eliminarCuenta);
  peligro.append(formulario);
  panel.append(tarjetaCuenta, peligro);
  estado.controlesCuenta = { correoActual, formulario, input, mensaje, boton };
}

/** Crea los grupos de interruptores desde los campos realmente presentes en MySQL. */
function construirPanelPreferencias(panel, tipo) {
  const esPrivacidad = tipo === "privacidad";
  const tarjeta = crearElemento("section", { clase: "tarjeta config-tarjeta" });
  tarjeta.append(
    crearElemento("h3", { clase: "config-tarjeta__titulo", texto: esPrivacidad ? "Privacidad y datos" : "Tus avisos" }),
    crearElemento("p", { clase: "config-tarjeta__descripcion", texto: esPrivacidad ? "Controla las opciones de visibilidad y uso de información disponibles en tu cuenta." : "Elige qué comunicaciones de PetCare deseas recibir." })
  );
  const lista = crearElemento("div", { clase: "config-opciones", atributos: { id: `config-opciones-${tipo}` } });
  tarjeta.append(lista);
  panel.append(tarjeta);
  estado[esPrivacidad ? "controlesPrivacidad" : "controlesNotificaciones"] = { lista };

  if (!esPrivacidad) {
    const aviso = crearElemento("aside", { clase: "config-no-disponible", atributos: { role: "note" } });
    aviso.append(
      crearElemento("strong", { texto: "Avisos de vacunas" }),
      crearElemento("p", { texto: "Las opciones específicas para recordatorio de vacunas, aviso el día anterior y vacunas vencidas no están disponibles como preferencias individuales en CONFIGURACION_USUARIO. No se muestran como interruptores para evitar guardar campos que no existen." })
    );
    panel.append(aviso);
  }
}

/** Crea el formulario para cambiar la contraseña desde la pestaña Seguridad. */
function construirPanelSeguridad(panel) {
  const tarjeta = crearElemento("section", { clase: "tarjeta config-tarjeta", atributos: { "aria-labelledby": "config-seguridad-titulo" } });
  tarjeta.append(
    crearElemento("h3", { clase: "config-tarjeta__titulo", texto: "Cambiar contraseña", atributos: { id: "config-seguridad-titulo" } }),
    crearElemento("p", { clase: "config-tarjeta__descripcion", texto: "Introduce tu contraseña actual y elige una nueva. La confirmación se comprueba antes de enviar." })
  );
  const formulario = crearElemento("form", { clase: "formulario config-password-form", atributos: { id: "config-password-form" } });
  const actual = crearCampoPassword("Contraseña actual", "contrasena_actual", "current-password");
  const nueva = crearCampoPassword("Contraseña nueva", "contrasena_nueva", "new-password");
  const confirmar = crearCampoPassword("Confirmar contraseña nueva", "confirmar_contrasena", "new-password");
  formulario.append(actual.bloque, nueva.bloque, confirmar.bloque);
  const mensaje = crearElemento("p", { clase: "config-form__mensaje", atributos: { role: "status", "aria-live": "polite", hidden: "" } });
  const boton = crearElemento("button", { clase: "boton", texto: "Actualizar contraseña", atributos: { type: "submit" } });
  formulario.append(mensaje, boton);
  formulario.addEventListener("submit", cambiarContrasena);
  tarjeta.append(formulario);
  panel.append(tarjeta);
  estado.controlesSeguridad = { formulario, actual: actual.input, nueva: nueva.input, confirmar: confirmar.input, mensaje, boton };
}

/** Construye un campo de contraseña con su etiqueta. */
function crearCampoPassword(etiqueta, nombre, autocomplete) {
  const bloque = crearElemento("div", { clase: "campo" });
  const id = `config-${nombre}`;
  const label = crearElemento("label", { clase: "campo__etiqueta", texto: etiqueta, atributos: { for: id } });
  const input = crearElemento("input", { clase: "campo__control", atributos: { type: "password", id, name: nombre, autocomplete, required: "" } });
  bloque.append(label, input);
  return { bloque, input };
}

/** Cambia la pestaña visible y sincroniza los atributos ARIA. */
function seleccionarPestana(clave, actualizarHash = false) {
  if (!PESTANAS.includes(clave) || !estado.pagina) return;
  estado.pagina.botones.forEach((boton) => {
    const activa = boton.dataset.tab === clave;
    boton.setAttribute("aria-selected", String(activa));
    boton.tabIndex = activa ? 0 : -1;
  });
  Object.entries(estado.pagina.paneles).forEach(([nombre, panel]) => {
    panel.hidden = nombre !== clave;
  });
  if (actualizarHash && window.location.hash !== `#${clave}`) {
    window.history.replaceState(null, "", `#${clave}`);
  }
}

/** Muestra un aviso general de carga o error con texto plano. */
function mostrarEstadoGeneral(mensaje, error = false) {
  const region = estado.pagina?.estadoGeneral;
  if (!region) return;
  region.textContent = mensaje;
  region.classList.toggle("es-error", error);
  region.hidden = !mensaje;
}

/** Crea una fila de preferencia con interruptor y confirmación individual. */
function crearOpcionPreferencia(definicion, valores) {
  const fila = crearElemento("div", { clase: "config-opcion" });
  const textos = crearElemento("div", { clase: "config-opcion__textos" });
  textos.append(
    crearElemento("strong", { texto: definicion.titulo }),
    crearElemento("p", { texto: definicion.descripcion })
  );
  const controles = crearElemento("div", { clase: "config-opcion__control" });
  const estadoGuardado = crearElemento("span", { clase: "config-opcion__estado", atributos: { role: "status", "aria-live": "polite" } });
  const id = `preferencia-${definicion.campo}`;
  const existe = Object.prototype.hasOwnProperty.call(valores || {}, definicion.campo);
  const interruptor = crearElemento("input", {
    clase: "config-interruptor__input",
    atributos: { type: "checkbox", role: "switch", id, name: definicion.campo, "aria-label": definicion.titulo, disabled: existe ? null : "" }
  });
  if (existe) interruptor.checked = Boolean(Number(valores[definicion.campo]) || valores[definicion.campo] === true);
  const interruptorVisual = crearElemento("span", { clase: "config-interruptor__visual", atributos: { "aria-hidden": "true" } });
  const etiqueta = crearElemento("label", { clase: "config-interruptor", atributos: { for: id } });
  etiqueta.append(interruptor, interruptorVisual);
  controles.append(etiqueta, estadoGuardado);
  if (!existe) {
    estadoGuardado.textContent = "No disponible";
    estadoGuardado.classList.add("es-error");
    textos.append(crearElemento("small", { texto: "El servidor no devolvió este campo de configuración." }));
  }
  fila.append(textos, controles);

  if (existe) {
    interruptor.addEventListener("change", () => guardarPreferencia(definicion.campo, interruptor, estadoGuardado));
  }
  return fila;
}

/** Renderiza las preferencias solo después de recibir los valores persistidos por el servidor. */
function renderizarPreferencias() {
  if (!estado.preferencias || !estado.pagina) return;
  const notificaciones = estado.controlesNotificaciones.lista;
  const privacidad = estado.controlesPrivacidad.lista;
  notificaciones.replaceChildren(...PREFERENCIAS_NOTIFICACION.map((item) => crearOpcionPreferencia(item, estado.preferencias)));
  privacidad.replaceChildren(...PREFERENCIAS_PRIVACIDAD.map((item) => crearOpcionPreferencia(item, estado.preferencias)));
}

/** Obtiene preferencias desde GET y no aplica valores predeterminados inventados en el cliente. */
async function cargarPreferencias() {
  estado.cargandoPreferencias = true;
  const listas = [estado.controlesNotificaciones.lista, estado.controlesPrivacidad.lista];
  listas.forEach((lista) => lista.replaceChildren(crearElemento("p", { clase: "config-cargando", texto: "Cargando preferencias…", atributos: { role: "status" } })));
  try {
    const respuesta = await api.preferencias.obtener();
    if (!respuesta?.preferencias || typeof respuesta.preferencias !== "object") {
      throw new Error("El servidor no devolvió las preferencias de la cuenta.");
    }
    estado.preferencias = respuesta.preferencias;
    renderizarPreferencias();
    mostrarEstadoGeneral("Preferencias cargadas.");
  } catch (error) {
    const mensaje = error instanceof ApiError ? error.error || error.message : error.message || "No fue posible cargar las preferencias.";
    listas.forEach((lista) => {
      const aviso = crearElemento("div", { clase: "config-error" });
      aviso.append(
        crearElemento("p", { texto: mensaje }),
        crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } })
      );
      aviso.querySelector("button").addEventListener("click", cargarPreferencias);
      lista.replaceChildren(aviso);
    });
    mostrarEstadoGeneral(mensaje, true);
  } finally {
    estado.cargandoPreferencias = false;
  }
}

/** Guarda un único campo y revierte inmediatamente el control si el servidor responde con error. */
async function guardarPreferencia(campo, interruptor, regionEstado) {
  if (estado.guardandoCampos.has(campo)) return;
  const valorAnterior = !interruptor.checked;
  const nuevoValor = interruptor.checked;
  estado.guardandoCampos.add(campo);
  interruptor.disabled = true;
  regionEstado.textContent = "Guardando…";
  regionEstado.classList.remove("es-error");
  try {
    const respuesta = await api.preferencias.actualizar({ [campo]: nuevoValor });
    const valoresRespuesta = respuesta?.preferencias;
    const valorConfirmado = valoresRespuesta && Object.prototype.hasOwnProperty.call(valoresRespuesta, campo)
      ? Boolean(Number(valoresRespuesta[campo]) || valoresRespuesta[campo] === true)
      : nuevoValor;
    estado.preferencias[campo] = valorConfirmado;
    interruptor.checked = valorConfirmado;
    regionEstado.textContent = "Guardado";
  } catch (error) {
    interruptor.checked = valorAnterior;
    estado.preferencias[campo] = valorAnterior;
    regionEstado.textContent = error instanceof ApiError ? error.error || "No se pudo guardar" : "No se pudo guardar";
    regionEstado.classList.add("es-error");
  } finally {
    interruptor.disabled = false;
    estado.guardandoCampos.delete(campo);
  }
}

/** Carga el correo de cuenta necesario para habilitar una eliminación confirmada. */
async function cargarPerfilCuenta() {
  estado.cargandoPerfil = true;
  const controles = estado.controlesCuenta;
  controles.correoActual.textContent = "Consultando correo de la cuenta…";
  controles.input.disabled = true;
  try {
    const respuesta = await api.perfil.obtener();
    if (!respuesta?.perfil) throw new Error("El servidor no devolvió los datos de la cuenta.");
    estado.perfil = respuesta.perfil;
    controles.correoActual.textContent = respuesta.perfil.correo || "Correo no disponible";
    controles.input.disabled = !respuesta.perfil.correo;
    validarCorreoConfirmacion();
  } catch (error) {
    controles.correoActual.textContent = error instanceof ApiError ? error.error || error.message : error.message || "No fue posible consultar el correo.";
    controles.input.disabled = true;
    controles.mensaje.textContent = "No se pudo verificar el correo de la cuenta. Vuelve a cargar la página para intentarlo de nuevo.";
    controles.mensaje.hidden = false;
    controles.mensaje.classList.add("es-error");
  } finally {
    estado.cargandoPerfil = false;
  }
}

/** Habilita el envío solo cuando el correo escrito coincide con el correo real de la cuenta. */
function validarCorreoConfirmacion() {
  const controles = estado.controlesCuenta;
  const correoReal = textoSeguro(estado.perfil?.correo).trim().toLocaleLowerCase("es-CO");
  const correoEscrito = textoSeguro(controles?.input.value).trim().toLocaleLowerCase("es-CO");
  if (controles) controles.boton.disabled = estado.eliminandoCuenta || !correoReal || correoEscrito !== correoReal;
}

/** Solicita confirmación final, envía el correo y elimina el estado local al completar. */
async function eliminarCuenta(evento) {
  evento.preventDefault();
  const controles = estado.controlesCuenta;
  if (estado.eliminandoCuenta || controles.boton.disabled || !estado.perfil?.correo) return;
  const correo = controles.input.value.trim();
  if (correo.toLocaleLowerCase("es-CO") !== estado.perfil.correo.trim().toLocaleLowerCase("es-CO")) return;
  const confirmar = window.confirm("¿Confirmas que deseas eliminar tu cuenta PetCare? Esta acción no se puede deshacer.");
  if (!confirmar) return;

  estado.eliminandoCuenta = true;
  controles.boton.disabled = true;
  controles.boton.textContent = "Eliminando…";
  controles.mensaje.hidden = true;
  try {
    await api.cuenta.eliminar({ correo_confirmacion: correo });
    limpiarEstadoLocal();
    window.location.replace(RUTAS.login);
  } catch (error) {
    controles.mensaje.textContent = error instanceof ApiError ? error.error || error.message : error.message || "No fue posible eliminar la cuenta.";
    controles.mensaje.classList.add("es-error");
    controles.mensaje.hidden = false;
  } finally {
    estado.eliminandoCuenta = false;
    controles.boton.textContent = "Eliminar mi cuenta";
    validarCorreoConfirmacion();
  }
}

/** Muestra errores de validación del servidor junto al campo correspondiente. */
function mostrarErroresPassword(error, formulario) {
  const campos = error instanceof ApiError ? error.campos : {};
  let asociados = 0;
  for (const [nombre, valor] of Object.entries(campos || {})) {
    const control = formulario.elements.namedItem(nombre);
    const mensaje = Array.isArray(valor) ? valor.join(" ") : typeof valor === "string" ? valor : "Revisa este campo.";
    if (control && "setAttribute" in control) {
      control.setAttribute("aria-invalid", "true");
      asociados += 1;
    }
  }
  return asociados;
}

/** Cambia la contraseña sin guardar ni registrar credenciales en el navegador. */
async function cambiarContrasena(evento) {
  evento.preventDefault();
  const controles = estado.controlesSeguridad;
  if (estado.cambiandoContrasena || !controles.formulario.reportValidity()) return;
  if (controles.nueva.value !== controles.confirmar.value) {
    controles.confirmar.setAttribute("aria-invalid", "true");
    controles.mensaje.textContent = "Las contraseñas nuevas no coinciden.";
    controles.mensaje.classList.add("es-error");
    controles.mensaje.hidden = false;
    controles.confirmar.focus();
    return;
  }
  if (controles.actual.value === controles.nueva.value) {
    controles.nueva.setAttribute("aria-invalid", "true");
    controles.mensaje.textContent = "La nueva contraseña debe ser diferente de la actual.";
    controles.mensaje.classList.add("es-error");
    controles.mensaje.hidden = false;
    controles.nueva.focus();
    return;
  }

  estado.cambiandoContrasena = true;
  controles.boton.disabled = true;
  controles.boton.textContent = "Actualizando…";
  controles.mensaje.hidden = true;
  controles.formulario.querySelectorAll("[aria-invalid='true']").forEach((campo) => campo.removeAttribute("aria-invalid"));
  try {
    const respuesta = await api.perfil.cambiarContrasena({
      contrasena_actual: controles.actual.value,
      contrasena_nueva: controles.nueva.value
    });
    controles.formulario.reset();
    controles.mensaje.textContent = respuesta?.mensaje || "Tu contraseña se actualizó correctamente.";
    controles.mensaje.classList.remove("es-error");
    controles.mensaje.hidden = false;
  } catch (error) {
    mostrarErroresPassword(error, controles.formulario);
    controles.mensaje.textContent = error instanceof ApiError ? error.error || error.message : error.message || "No fue posible cambiar la contraseña.";
    controles.mensaje.classList.add("es-error");
    controles.mensaje.hidden = false;
  } finally {
    estado.cambiandoContrasena = false;
    controles.boton.disabled = false;
    controles.boton.textContent = "Actualizar contraseña";
  }
}

/** Presenta errores de arranque de forma recuperable. */
function mostrarErrorInicial(contenedor, error) {
  const tarjeta = crearElemento("section", { clase: "config-error tarjeta" });
  tarjeta.append(
    crearElemento("h2", { texto: "No pudimos abrir la configuración" }),
    crearElemento("p", { texto: error instanceof ApiError ? error.error || error.message : error?.message || "Ocurrió un error al validar tu sesión." }),
    crearElemento("a", { clase: "boton boton--secundario", texto: "Volver al inicio", atributos: { href: RUTAS.inicio } })
  );
  contenedor.replaceChildren(tarjeta);
  contenedor.setAttribute("aria-busy", "false");
}

/** Valida la sesión, monta el layout y carga preferencias/correo en paralelo. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  try {
    estado.sesion = await protegerPagina({ roles: ["usuario", "administrador"], loginUrl: RUTAS.login, inicioUrl: RUTAS.inicio });
    if (!estado.sesion) return;
    estado.layout = montarLayout({ contenedor, sesion: estado.sesion, titulo: "Configuración", paginaActual: "/configuracion.html" });
    estado.pagina = construirPagina(estado.layout.contenido);
    const pestanaInicial = PESTANAS.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "cuenta";
    seleccionarPestana(pestanaInicial);
    await Promise.all([cargarPreferencias(), cargarPerfilCuenta()]);
    contenedor.setAttribute("aria-busy", "false");
  } catch (error) {
    mostrarErrorInicial(contenedor, error);
  }
}

iniciar();
