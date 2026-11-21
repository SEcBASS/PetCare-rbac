/**
 * Módulo Asistente IA para el rol usuario.
 * Consulta el historial de conversaciones y envía mensajes al servicio de IA del backend.
 * El navegador nunca decide si una pregunta está permitida: el servidor aplica el alcance
 * de perros y gatos y devuelve cualquier aviso de fuera de tema como texto normal.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  inicio: "/inicio.html"
};

const PREGUNTAS_SUGERIDAS = [
  "¿Qué cuidados básicos necesita mi mascota cada día?",
  "¿Qué alimentos debo evitar darle a mi perro o gato?",
  "¿Cómo puedo cuidar su higiene y pelaje?",
  "¿Qué señales indican que debo consultar a un veterinario?"
];

const ICONOS = {
  asistente: ["M12 3a7 7 0 0 0-7 7v3a3 3 0 0 0 3 3h1v-6H8a4 4 0 0 1 8 0h-1v6h1a3 3 0 0 0 3-3v-3a7 7 0 0 0-7-7Z", "M15 20h-3a2 2 0 0 1-2-2v-1"],
  enviar: ["m22 2-7 20-4-9-9-4Z", "M22 2 11 13"],
  nuevo: ["M12 5v14", "M5 12h14"],
  historial: ["M3 12a9 9 0 1 0 2.6-6.4L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  mascota: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  reloj: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  escudo: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
  cerrar: ["M18 6 6 18", "m6 6 12 12"]
};

const estado = {
  sesion: null,
  mascotas: [],
  conversaciones: [],
  mensajes: [],
  conversacionId: null,
  mascotaId: "",
  cargandoConversaciones: true,
  cargandoMensajes: false,
  enviando: false,
  cargandoMascotas: true,
  errorConversaciones: null,
  errorMensajes: null,
  errorMascotas: null,
  errorEnvio: null,
  mensajePendiente: "",
  secuenciaConversacion: 0,
  regiones: null
};

/** Crea nodos HTML y asigna el contenido dinámico exclusivamente como texto plano. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un ícono SVG usando únicamente trazos estáticos definidos en el módulo. */
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

/** Devuelve una colección JSON manteniendo el contrato estándar { datos: [] }. */
function obtenerColeccion(respuesta, claveAlterna) {
  if (Array.isArray(respuesta)) return respuesta;
  if (Array.isArray(respuesta?.datos)) return respuesta.datos;
  if (claveAlterna && Array.isArray(respuesta?.[claveAlterna])) return respuesta[claveAlterna];
  return [];
}

/** Normaliza el nombre de especie para comprobar que la mascota sea perro o gato. */
function normalizarEspecie(mascota) {
  const valor = mascota?.nombre_especie
    ?? mascota?.especie_nombre
    ?? mascota?.especie?.nombre
    ?? mascota?.especie
    ?? "";
  return textoSeguro(valor)
    .trim()
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Acepta especies caninas y felinas; si el alias no viene, conserva la mascota del catálogo autorizado. */
function esPerroOGato(mascota) {
  const especie = normalizarEspecie(mascota);
  if (!especie) return true;
  return /^(perro|perros|canino|canina|gato|gatos|felino|felina)$/.test(especie);
}

/** Convierte un error HTTP o de red en un mensaje apto para la interfaz. */
function mensajeError(error, respaldo) {
  if (error instanceof ApiError) return error.error || error.message;
  return error?.message || respaldo;
}

/** Formatea una fecha de conversación sin inventar fechas cuando el dato falta o no es válido. */
function formatearFechaConversacion(valor) {
  if (!valor) return "";
  const fecha = new Date(String(valor).replace(" ", "T"));
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: fecha.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
  }).format(fecha);
}

/** Construye la cabecera, el historial y el área de conversación dentro del layout compartido. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "asistente-pagina" });

  const hero = crearElemento("header", {
    clase: "asistente-hero",
    atributos: { "aria-labelledby": "asistente-hero-titulo" }
  });
  const heroContenido = crearElemento("div", { clase: "asistente-hero__contenido" });
  const sello = crearElemento("span", { clase: "asistente-hero__sello" });
  sello.append(crearIcono("asistente"), crearElemento("span", { texto: "PETCARE AI" }));
  heroContenido.append(
    sello,
    crearElemento("h2", { texto: "PetCare AI", atributos: { id: "asistente-hero-titulo" } }),
    crearElemento("p", { texto: "Tu asistente para el cuidado de tu mascota" })
  );
  const botonNuevo = crearElemento("button", {
    clase: "asistente-boton-nuevo",
    texto: "Nueva conversación",
    atributos: { type: "button" }
  });
  botonNuevo.prepend(crearIcono("nuevo"));
  botonNuevo.addEventListener("click", iniciarNuevaConversacion);
  hero.append(heroContenido, botonNuevo);

  const espacio = crearElemento("section", {
    clase: "asistente-espacio",
    atributos: { "aria-label": "Chat y conversaciones anteriores" }
  });

  const historial = crearElemento("aside", {
    clase: "asistente-historial",
    atributos: { "aria-labelledby": "asistente-historial-titulo" }
  });
  const historialCabecera = crearElemento("div", { clase: "asistente-historial__cabecera" });
  const tituloHistorial = crearElemento("h3", { texto: "Tus conversaciones", atributos: { id: "asistente-historial-titulo" } });
  const iconoHistorial = crearElemento("span", { clase: "asistente-historial__icono" });
  iconoHistorial.append(crearIcono("historial"));
  historialCabecera.append(iconoHistorial, tituloHistorial);
  const listaHistorial = crearElemento("div", {
    clase: "asistente-historial__lista",
    atributos: { id: "asistente-lista-historial", "aria-live": "polite" }
  });
  historial.append(historialCabecera, listaHistorial);

  const chat = crearElemento("section", {
    clase: "asistente-chat",
    atributos: { "aria-label": "Conversación con PetCare AI" }
  });
  const chatCabecera = crearElemento("header", { clase: "asistente-chat__cabecera" });
  const chatTitulo = crearElemento("div", { clase: "asistente-chat__identidad" });
  const avatar = crearElemento("span", { clase: "asistente-chat__avatar", atributos: { "aria-hidden": "true" } });
  avatar.append(crearIcono("asistente"));
  const identidadTexto = crearElemento("div");
  identidadTexto.append(
    crearElemento("h3", { texto: "PetCare AI" }),
    crearElemento("p", { texto: "Asistente de perros y gatos" })
  );
  chatTitulo.append(avatar, identidadTexto);

  const selectorGrupo = crearElemento("div", { clase: "asistente-mascota" });
  const selectorEtiqueta = crearElemento("label", {
    texto: "Contexto de mascota",
    atributos: { for: "asistente-mascota-select" }
  });
  const selectorMascota = crearElemento("select", {
    clase: "asistente-mascota__select",
    atributos: { id: "asistente-mascota-select", name: "mascota_id" }
  });
  selectorMascota.addEventListener("change", () => {
    estado.mascotaId = selectorMascota.value;
  });
  selectorGrupo.append(selectorEtiqueta, selectorMascota);
  chatCabecera.append(chatTitulo, selectorGrupo);

  const mensajes = crearElemento("div", {
    clase: "asistente-chat__mensajes",
    atributos: { id: "asistente-mensajes", role: "log", "aria-live": "polite", "aria-relevant": "additions text", tabindex: "0", "aria-label": "Mensajes de la conversación" }
  });

  const errorChat = crearElemento("div", {
    clase: "asistente-chat__error",
    atributos: { id: "asistente-error", role: "alert", hidden: "" }
  });

  const formulario = crearElemento("form", { clase: "asistente-compositor", atributos: { id: "asistente-formulario" } });
  const campo = crearElemento("textarea", {
    clase: "asistente-compositor__campo",
    atributos: {
      id: "asistente-texto",
      name: "texto",
      rows: "2",
      placeholder: "Escribe tu pregunta sobre el cuidado de perros y gatos…",
      "aria-label": "Escribe tu mensaje para PetCare AI",
      "aria-describedby": "asistente-ayuda-teclado"
    }
  });
  campo.addEventListener("input", actualizarEstadoEnvio);
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      enviarMensaje();
    }
  });
  const pieCompositor = crearElemento("div", { clase: "asistente-compositor__pie" });
  const ayuda = crearElemento("span", {
    clase: "asistente-compositor__ayuda",
    texto: "Enter para enviar · Shift + Enter para nueva línea",
    atributos: { id: "asistente-ayuda-teclado" }
  });
  const botonEnviar = crearElemento("button", {
    clase: "asistente-boton-enviar",
    atributos: { type: "submit", disabled: "" }
  });
  const botonEnviarTexto = crearElemento("span", { texto: "Enviar" });
  botonEnviar.append(crearIcono("enviar"), botonEnviarTexto);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviarMensaje();
  });
  pieCompositor.append(ayuda, botonEnviar);
  formulario.append(campo, pieCompositor);

  const aviso = crearElemento("p", {
    clase: "asistente-chat__aviso",
    texto: "PetCare AI proporciona información general y no sustituye a un veterinario."
  });

  chat.append(chatCabecera, mensajes, errorChat, formulario, aviso);
  espacio.append(historial, chat);
  pagina.append(hero, espacio);
  contenedor.replaceChildren(pagina);

  estado.regiones = {
    pagina,
    listaHistorial,
    selectorMascota,
    mensajes,
    errorChat,
    campo,
    botonEnviar,
    botonEnviarTexto,
    botonNuevo
  };
  renderizarSelectorMascotas();
  renderizarHistorial();
  renderizarChat();
}

/** Actualiza el selector con las mascotas activas que realmente pertenecen al usuario. */
function renderizarSelectorMascotas() {
  const selector = estado.regiones?.selectorMascota;
  if (!selector) return;
  const opciones = [crearElemento("option", { texto: "Sin mascota seleccionada", atributos: { value: "" } })];
  for (const mascota of estado.mascotas) {
    const nombre = textoSeguro(mascota.nombre || "Mascota");
    const especie = mascota.nombre_especie || mascota.especie_nombre || mascota.especie?.nombre || "";
    const texto = especie ? `${nombre} · ${textoSeguro(especie)}` : nombre;
    opciones.push(crearElemento("option", { texto, atributos: { value: mascota.id } }));
  }
  selector.replaceChildren(...opciones);
  selector.value = estado.mascotaId || "";
  selector.disabled = estado.cargandoMascotas || estado.mascotas.length === 0;
  const ayuda = selector.parentElement.querySelector(".asistente-mascota__ayuda");
  if (ayuda) ayuda.remove();
  if (estado.errorMascotas) {
    selector.parentElement.append(crearElemento("small", {
      clase: "asistente-mascota__ayuda asistente-mascota__ayuda--error",
      texto: "No pudimos consultar tus mascotas. Puedes continuar sin contexto."
    }));
  } else if (!estado.cargandoMascotas && estado.mascotas.length === 0) {
    selector.parentElement.append(crearElemento("small", {
      clase: "asistente-mascota__ayuda",
      texto: "No tienes mascotas activas para seleccionar."
    }));
  }
}

/** Dibuja una fila del historial sin insertar títulos como HTML. */
function crearItemHistorial(conversacion) {
  const id = conversacion?.id;
  const boton = crearElemento("button", {
    clase: "asistente-historial__item",
    atributos: { type: "button", "aria-current": String(String(id) === String(estado.conversacionId)) }
  });
  const icono = crearElemento("span", { clase: "asistente-historial__item-icono" });
  icono.append(crearIcono("historial"));
  const contenido = crearElemento("span", { clase: "asistente-historial__item-contenido" });
  const titulo = conversacion?.titulo || "Conversación sin título";
  const fecha = formatearFechaConversacion(conversacion?.actualizado_en || conversacion?.creado_en);
  contenido.append(
    crearElemento("span", { clase: "asistente-historial__item-titulo", texto: titulo }),
    crearElemento("span", { clase: "asistente-historial__item-fecha", texto: fecha })
  );
  boton.append(icono, contenido);
  boton.addEventListener("click", () => cargarConversacion(id));
  return boton;
}

/** Representa carga, error, lista vacía o conversaciones existentes. */
function renderizarHistorial() {
  const contenedor = estado.regiones?.listaHistorial;
  if (!contenedor) return;
  contenedor.setAttribute("aria-busy", String(estado.cargandoConversaciones));

  if (estado.cargandoConversaciones) {
    contenedor.replaceChildren(crearElemento("p", { clase: "asistente-historial__estado", texto: "Cargando conversaciones…" }));
    return;
  }
  if (estado.errorConversaciones) {
    const bloque = crearElemento("div", { clase: "asistente-historial__estado asistente-historial__estado--error" });
    bloque.append(
      crearElemento("p", { texto: estado.errorConversaciones }),
      crearElemento("button", { clase: "asistente-enlace", texto: "Volver a intentar", atributos: { type: "button" } })
    );
    bloque.querySelector("button").addEventListener("click", () => cargarConversaciones());
    contenedor.replaceChildren(bloque);
    return;
  }
  if (!estado.conversaciones.length) {
    contenedor.replaceChildren(crearElemento("p", {
      clase: "asistente-historial__estado",
      texto: "Todavía no tienes conversaciones guardadas. Cuando inicies una, aparecerá aquí."
    }));
    return;
  }
  const fragmento = document.createDocumentFragment();
  estado.conversaciones.forEach((conversacion) => fragmento.append(crearItemHistorial(conversacion)));
  contenedor.replaceChildren(fragmento);
}

/** Construye el saludo con los nombres reales consultados; nunca genera mascotas de ejemplo. */
function crearBienvenida() {
  const bloque = crearElemento("article", { clase: "asistente-bienvenida" });
  const avatar = crearElemento("span", { clase: "asistente-bienvenida__avatar", atributos: { "aria-hidden": "true" } });
  avatar.append(crearIcono("asistente"));
  const contenido = crearElemento("div", { clase: "asistente-bienvenida__contenido" });
  let saludo;
  if (estado.mascotas.length) {
    const nombres = estado.mascotas.map((mascota) => textoSeguro(mascota.nombre || "Mascota"));
    const nombresTexto = nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
    saludo = `¡Hola! Estoy aquí para ayudarte con el cuidado de ${nombresTexto}.`;
  } else if (estado.errorMascotas) {
    saludo = "¡Hola! Soy PetCare AI. No pude consultar ahora los nombres de tus mascotas, pero puedes empezar una conversación sin seleccionar una.";
  } else {
    saludo = "¡Hola! Soy PetCare AI. Puedo orientarte sobre el cuidado de perros y gatos. Cuando registres tus mascotas, podrás seleccionarlas para darme más contexto.";
  }
  contenido.append(
    crearElemento("p", { clase: "asistente-bienvenida__nombre", texto: "PetCare AI" }),
    crearElemento("p", { texto: saludo })
  );
  bloque.append(avatar, contenido);
  return bloque;
}

/** Construye una burbuja segura para un mensaje de usuario o del asistente. */
function crearBurbuja(mensaje) {
  const rolOriginal = textoSeguro(mensaje?.rol).toLowerCase();
  const esUsuario = rolOriginal === "usuario" || rolOriginal === "user";
  const esAsistente = rolOriginal === "asistente" || rolOriginal === "assistant";
  if (!esUsuario && !esAsistente) return null;

  const fila = crearElemento("article", {
    clase: `asistente-mensaje ${esUsuario ? "asistente-mensaje--usuario" : "asistente-mensaje--ia"}`,
    atributos: { "aria-label": esUsuario ? "Mensaje enviado por ti" : "Respuesta de PetCare AI" }
  });
  if (esAsistente) {
    const avatar = crearElemento("span", { clase: "asistente-mensaje__avatar", atributos: { "aria-hidden": "true" } });
    avatar.append(crearIcono("asistente"));
    fila.append(avatar);
  }
  const burbuja = crearElemento("div", { clase: "asistente-mensaje__burbuja" });
  const texto = mensaje?.contenido ?? mensaje?.texto ?? mensaje?.mensaje ?? "";
  burbuja.append(crearElemento("p", { texto }));
  fila.append(burbuja);
  return fila;
}

/** Muestra el indicador animado mientras el backend procesa una respuesta. */
function crearIndicadorEscritura() {
  const indicador = crearElemento("div", {
    clase: "asistente-escribiendo",
    atributos: { role: "status", "aria-label": "PetCare AI está escribiendo" }
  });
  const avatar = crearElemento("span", { clase: "asistente-mensaje__avatar", atributos: { "aria-hidden": "true" } });
  avatar.append(crearIcono("asistente"));
  const burbuja = crearElemento("span", { clase: "asistente-escribiendo__burbuja" });
  burbuja.append(
    crearElemento("span", { clase: "asistente-escribiendo__punto" }),
    crearElemento("span", { clase: "asistente-escribiendo__punto" }),
    crearElemento("span", { clase: "asistente-escribiendo__punto" }),
    crearElemento("span", { clase: "asistente-escribiendo__texto", texto: "PetCare AI está escribiendo…" })
  );
  indicador.append(avatar, burbuja);
  return indicador;
}

/** Dibuja las cuatro consultas sugeridas solo cuando se inicia una conversación nueva. */
function crearSugerencias() {
  const seccion = crearElemento("section", {
    clase: "asistente-sugerencias",
    atributos: { "aria-labelledby": "asistente-sugerencias-titulo" }
  });
  seccion.append(crearElemento("h4", { texto: "Puedes preguntarme sobre…", atributos: { id: "asistente-sugerencias-titulo" } }));
  const rejilla = crearElemento("div", { clase: "asistente-sugerencias__rejilla" });
  PREGUNTAS_SUGERIDAS.forEach((pregunta) => {
    const boton = crearElemento("button", {
      clase: "asistente-sugerencia",
      texto: pregunta,
      atributos: { type: "button" }
    });
    boton.addEventListener("click", () => {
      if (estado.enviando || estado.cargandoMensajes) return;
      estado.regiones.campo.value = pregunta;
      enviarMensaje(pregunta);
    });
    rejilla.append(boton);
  });
  seccion.append(rejilla);
  return seccion;
}

/** Presenta la conversación activa, bienvenida, historial, sugerencias e indicador de escritura. */
function renderizarChat() {
  const contenedor = estado.regiones?.mensajes;
  if (!contenedor) return;
  contenedor.setAttribute("aria-busy", String(estado.cargandoMensajes || estado.enviando));

  if (estado.cargandoMensajes) {
    contenedor.replaceChildren(crearElemento("p", { clase: "asistente-chat__estado", texto: "Cargando esta conversación…" }));
    actualizarEstadoEnvio();
    return;
  }

  const fragmento = document.createDocumentFragment();
  if (!estado.mensajes.length) {
    fragmento.append(crearBienvenida(), crearSugerencias());
  } else {
    estado.mensajes.forEach((mensaje) => {
      const burbuja = crearBurbuja(mensaje);
      if (burbuja) fragmento.append(burbuja);
    });
  }

  if (estado.enviando && estado.mensajePendiente) {
    const pendiente = crearBurbuja({ rol: "usuario", contenido: estado.mensajePendiente });
    if (pendiente) fragmento.append(pendiente);
    fragmento.append(crearIndicadorEscritura());
  }
  if (estado.errorMensajes) {
    fragmento.append(crearElemento("p", { clase: "asistente-chat__estado asistente-chat__estado--error", texto: estado.errorMensajes }));
  }
  contenedor.replaceChildren(fragmento);
  contenedor.scrollTop = contenedor.scrollHeight;
  actualizarEstadoEnvio();
}

/** Actualiza el mensaje de error del envío y el estado del botón para evitar dobles envíos. */
function renderizarErrorEnvio() {
  const contenedor = estado.regiones?.errorChat;
  if (!contenedor) return;
  if (!estado.errorEnvio) {
    contenedor.hidden = true;
    contenedor.replaceChildren();
    return;
  }
  contenedor.hidden = false;
  contenedor.textContent = estado.errorEnvio;
}

/** Habilita enviar únicamente cuando hay texto y ninguna petición está en curso. */
function actualizarEstadoEnvio() {
  const regiones = estado.regiones;
  if (!regiones) return;
  const hayTexto = Boolean(regiones.campo.value.trim());
  regiones.botonEnviar.disabled = estado.enviando || estado.cargandoMensajes || !hayTexto;
  regiones.botonEnviarTexto.textContent = estado.enviando ? "Enviando…" : "Enviar";
  regiones.campo.disabled = estado.enviando || estado.cargandoMensajes;
  regiones.botonNuevo.disabled = estado.enviando;
  regiones.selectorMascota.disabled = estado.cargandoMascotas || estado.mascotas.length === 0 || estado.enviando;
}

/** Carga las mascotas reales del usuario sin bloquear el uso general del chat ante un fallo. */
async function cargarMascotas() {
  estado.cargandoMascotas = true;
  estado.errorMascotas = null;
  renderizarSelectorMascotas();
  try {
    const respuesta = await api.mascotas.listar({ activa: true });
    estado.mascotas = obtenerColeccion(respuesta, "mascotas").filter(esPerroOGato);
  } catch (error) {
    estado.mascotas = [];
    estado.errorMascotas = mensajeError(error, "No fue posible consultar tus mascotas.");
  } finally {
    estado.cargandoMascotas = false;
    renderizarSelectorMascotas();
    renderizarChat();
  }
}

/** Consulta las conversaciones guardadas; el servidor limita la lista al usuario de la sesión. */
async function cargarConversaciones(silencioso = false) {
  if (!silencioso) {
    estado.cargandoConversaciones = true;
    estado.errorConversaciones = null;
    renderizarHistorial();
  }
  try {
    const respuesta = await api.asistente.listarConversaciones();
    estado.conversaciones = obtenerColeccion(respuesta, "conversaciones");
    estado.errorConversaciones = null;
  } catch (error) {
    estado.errorConversaciones = mensajeError(error, "No fue posible cargar tus conversaciones.");
  } finally {
    estado.cargandoConversaciones = false;
    renderizarHistorial();
  }
}

/** Abre una conversación previa y recupera sus mensajes desde el endpoint de detalle. */
async function cargarConversacion(id) {
  if (estado.enviando || id === undefined || id === null || id === "") return;
  const secuencia = ++estado.secuenciaConversacion;
  estado.conversacionId = id;
  estado.mensajes = [];
  estado.errorMensajes = null;
  estado.errorEnvio = null;
  estado.cargandoMensajes = true;
  estado.mascotaId = "";
  estado.regiones.selectorMascota.value = "";
  const resumen = estado.conversaciones.find((item) => String(item.id) === String(id));
  if (resumen && resumen.mascota_id !== undefined && resumen.mascota_id !== null) {
    const existe = estado.mascotas.some((mascota) => String(mascota.id) === String(resumen.mascota_id));
    estado.mascotaId = existe ? String(resumen.mascota_id) : "";
    estado.regiones.selectorMascota.value = estado.mascotaId;
  }
  renderizarHistorial();
  renderizarChat();
  try {
    const respuesta = await api.asistente.obtenerConversacion(id);
    if (secuencia !== estado.secuenciaConversacion) return;
    const conversacion = respuesta?.conversacion || {};
    estado.conversacionId = conversacion.id ?? id;
    const lista = obtenerColeccion(respuesta?.mensajes, "datos");
    estado.mensajes = lista.filter((mensaje) => {
      const rol = textoSeguro(mensaje?.rol).toLowerCase();
      return (rol === "usuario" || rol === "user
      return rol === "usuario" || rol === "user" || rol === "asistente" || rol === "assistant";
    });
    estado.mensajes = estado.mensajes.sort((a, b) => {
      const fechaA = new Date(String(a.creado_en || "").replace(" ", "T")).getTime() || 0;
      const fechaB = new Date(String(b.creado_en || "").replace(" ", "T")).getTime() || 0;
      return fechaA - fechaB;
    });
    if (conversacion.mascota_id !== undefined && conversacion.mascota_id !== null) {
      const existe = estado.mascotas.some((mascota) => String(mascota.id) === String(conversacion.mascota_id));
      estado.mascotaId = existe ? String(conversacion.mascota_id) : "";
      estado.regiones.selectorMascota.value = estado.mascotaId;
    }
  } catch (error) {
    if (secuencia === estado.secuenciaConversacion) {
      estado.errorMensajes = mensajeError(error, "No fue posible abrir esta conversación.");
    }
  } finally {
    if (secuencia === estado.secuenciaConversacion) {
      estado.cargandoMensajes = false;
      renderizarHistorial();
      renderizarChat();
    }
  }
}

/** Inicia un chat vacío; la conversación persistente se crea al enviar el primer mensaje. */
function iniciarNuevaConversacion() {
  if (estado.enviando) return;
  estado.secuenciaConversacion += 1;
  estado.conversacionId = null;
  estado.mensajes = [];
  estado.errorMensajes = null;
  estado.errorEnvio = null;
  estado.mensajePendiente = "";
  estado.cargandoMensajes = false;
  renderizarHistorial();
  renderizarChat();
  estado.regiones.campo.value = "";
  actualizarEstadoEnvio();
  estado.regiones.campo.focus();
}

/** Envía un texto al servicio local del backend y presenta su respuesta como texto plano. */
async function enviarMensaje(textoForzado) {
  if (estado.enviando || estado.cargandoMensajes) return;
  const campo = estado.regiones.campo;
  const texto = String(textoForzado ?? campo.value).trim();
  if (!texto) {
    campo.focus();
    return;
  }

  estado.enviando = true;
  estado.errorEnvio = null;
  estado.errorMensajes = null;
  estado.mensajePendiente = texto;
  renderizarErrorEnvio();
  renderizarChat();

  try {
    const respuesta = await api.asistente.enviarMensaje({
      conversacion_id: estado.conversacionId,
      mascota_id: estado.mascotaId || null,
      texto
    });

    const nuevoId = respuesta?.conversacion_id;
    if (nuevoId === undefined || nuevoId === null || nuevoId === "") {
      throw new Error("El servidor no devolvió el identificador de la conversación.");
    }
    if (typeof respuesta?.respuesta !== "string") {
      throw new Error("El servidor no devolvió el texto de respuesta esperado.");
    }

    estado.conversacionId = nuevoId;
    estado.mensajes.push(
      { rol: "usuario", contenido: texto },
      { rol: "asistente", contenido: respuesta.respuesta }
    );
    if (campo.value.trim() === texto) campo.value = "";
    estado.mensajePendiente = "";
  } catch (error) {
    estado.errorEnvio = mensajeError(error, "No fue posible enviar el mensaje. Comprueba tu conexión e inténtalo nuevamente.");
    estado.mensajePendiente = "";
  } finally {
    estado.enviando = false;
    renderizarErrorEnvio();
    renderizarHistorial();
    renderizarChat();
    if (!campo.value.trim()) campo.focus();
    actualizarEstadoEnvio();
  }

  if (estado.conversacionId !== null) cargarConversaciones(true);
}

/** Muestra el error de validación de sesión y permite volver a comprobarla. */
function mostrarErrorInicio(error) {
  const contenedor = document.querySelector("#app");
  contenedor.setAttribute("aria-busy", "false");
  const bloque = crearElemento("section", { clase: "asistente-inicio-error" });
  const avatar = crearElemento("span", { clase: "asistente-inicio-error__avatar", atributos: { "aria-hidden": "true" } });
  avatar.append(crearIcono("asistente"));
  bloque.append(
    avatar,
    crearElemento("h1", { texto: "No pudimos abrir PetCare AI" }),
    crearElemento("p", { texto: mensajeError(error, "Comprueba tu conexión e inténtalo nuevamente.") })
  );
  const boton = crearElemento("button", { clase: "boton", texto: "Volver a intentar", atributos: { type: "button" } });
  boton.addEventListener("click", iniciar);
  bloque.append(boton);
  contenedor.replaceChildren(bloque);
}

/** Inicia la interfaz tras validar que exista una sesión de usuario. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  contenedor.setAttribute("aria-busy", "true");
  try {
    const sesion = await protegerPagina({
      roles: ["usuario"],
      loginUrl: RUTAS.login,
      inicioUrl: RUTAS.inicio
    });
    if (!sesion) return;

    estado.sesion = sesion;
    const layout = montarLayout({
      contenedor,
      sesion,
      titulo: "Asistente IA",
      paginaActual: "/asistente.html"
    });
    construirPagina(layout.contenido);
    contenedor.setAttribute("aria-busy", "false");
    await Promise.allSettled([cargarMascotas(), cargarConversaciones()]);
  } catch (error) {
    mostrarErrorInicio(error);
  }
}

iniciar();
