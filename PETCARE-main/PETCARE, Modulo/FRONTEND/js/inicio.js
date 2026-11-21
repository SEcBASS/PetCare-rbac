/** Controlador del Inicio para el rol usuario. Los datos provienen exclusivamente de la API. */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { calcularEdad, formatearFecha, formatearHora, textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  admin: "/admin-usuarios.html",
  mascotas: "/mascotas.html",
  asistente: "/asistente.html"
};

const ICONOS = {
  huella: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  vacuna: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
  cita: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "M8 13h3", "M8 17h5"],
  recordatorio: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  flecha: ["M5 12h14", "m12 5 7 7-7 7"],
  agregar: ["M12 5v14", "M5 12h14"],
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
  reloj: ["M12 8v4l2.5 1.5", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  estrella: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
  alerta: ["M12 9v4", "M12 17h.01", "M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"]
};

/** Construye un nodo y establece los valores como texto/atributos, nunca como HTML recibido. */
function crearElemento(etiqueta, { clase, texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un icono SVG con trazos estáticos definidos en el propio módulo. */
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

/** Acepta fotos HTTPS o rutas del mismo origen; bloquea esquemas como javascript:. */
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

/** Extrae el primer nombre sin alterar el nombre completo guardado en USUARIOS. */
function obtenerNombreCorto(nombreCompleto) {
  const nombre = textoSeguro(nombreCompleto).trim();
  return nombre ? nombre.split(/\s+/)[0] : "";
}

/** Presenta números recibidos del servidor sin convertir valores ausentes en cero. */
function valorContador(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = Number(valor);
  return Number.isFinite(numero) ? new Intl.NumberFormat("es-CO").format(numero) : "—";
}

/** Crea una tarjeta indicadora cuyos contadores proceden del resumen del servidor. */
function crearIndicador({ clave, etiqueta, valor, icono }) {
  const tarjeta = crearElemento("article", { clase: `indicador indicador--${clave}` });
  const cajaIcono = crearElemento("span", { clase: "indicador__icono", atributos: { "aria-hidden": "true" } });
  cajaIcono.append(crearIcono(icono));
  const texto = crearElemento("div", { clase: "indicador__texto" });
  texto.append(
    crearElemento("strong", { clase: "indicador__valor", texto: valorContador(valor) }),
    crearElemento("span", { clase: "indicador__etiqueta", texto: etiqueta })
  );
  tarjeta.append(cajaIcono, texto);
  return tarjeta;
}

/** Renderiza los cuatro contadores recibidos mediante GET /api/inicio/resumen. */
function renderizarIndicadores(contenedor, resumen) {
  finalizarCarga(contenedor);
  const definiciones = [
    { clave: "mascotas", campo: "mascotas_registradas", etiqueta: "Mascotas registradas", icono: "huella" },
    { clave: "vacunas", campo: "vacunas_proximas", etiqueta: "Vacunas próximas", icono: "vacuna" },
    { clave: "citas", campo: "proximas_citas", etiqueta: "Próximas citas", icono: "cita" },
    { clave: "recordatorios", campo: "recordatorios_pendientes", etiqueta: "Recordatorios pendientes", icono: "recordatorio" }
  ];
  const fragmento = document.createDocumentFragment();
  for (const item of definiciones) {
    fragmento.append(crearIndicador({ ...item, valor: resumen?.[item.campo] }));
  }
  contenedor.replaceChildren(fragmento);
}

/** Construye los datos secundarios de una mascota usando campos del esquema y de v_mascotas_resumen. */
function crearDatoMascota(etiqueta, valor) {
  const contenedor = crearElemento("div", { clase: "mascota-resumen__dato" });
  contenedor.append(
    crearElemento("dt", { texto: etiqueta }),
    crearElemento("dd", { texto: valor || "No registrado" })
  );
  return contenedor;
}

/** Crea la tarjeta de perfil usando nodos, textContent y una URL de foto validada. */
function crearTarjetaMascota(mascota) {
  const tarjeta = crearElemento("article", { clase: "mascota-resumen" });
  const foto = crearElemento("div", { clase: "mascota-resumen__foto" });
  const rutaFoto = obtenerFotoSegura(mascota.foto_url);

  if (rutaFoto) {
    const imagen = crearElemento("img", {
      atributos: {
        src: rutaFoto,
        alt: `Fotografía de ${textoSeguro(mascota.nombre)}`,
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer"
      }
    });
    imagen.addEventListener("error", () => {
      imagen.remove();
      foto.append(crearIcono("huella"));
    }, { once: true });
    foto.append(imagen);
  } else {
    foto.append(crearIcono("huella"));
    foto.setAttribute("aria-label", "La mascota no tiene una fotografía registrada");
  }

  const cuerpo = crearElemento("div", { clase: "mascota-resumen__cuerpo" });
  const encabezado = crearElemento("div");
  encabezado.append(
    crearElemento("h3", { clase: "mascota-resumen__nombre", texto: mascota.nombre || "Mascota" }),
    crearElemento("p", {
      clase: "mascota-resumen__tipo",
      texto: [mascota.nombre_especie, mascota.nombre_raza].filter(Boolean).join(" · ") || "Especie o raza sin especificar"
    })
  );

  const datos = crearElemento("dl", { clase: "mascota-resumen__datos" });
  const edad = mascota.edad_anios !== undefined && mascota.edad_anios !== null
    ? `${valorContador(mascota.edad_anios)} ${Number(mascota.edad_anios) === 1 ? "año" : "años"}`
    : calcularEdad(mascota.fecha_nacimiento) || "No registrada";
  const peso = mascota.peso_actual_kg !== undefined && mascota.peso_actual_kg !== null
    ? `${textoSeguro(mascota.peso_actual_kg)} kg`
    : "No registrado";

  datos.append(
    crearDatoMascota("Edad", edad),
    crearDatoMascota("Peso", peso),
    crearDatoMascota("Especie", mascota.nombre_especie),
    crearDatoMascota("Raza", mascota.nombre_raza)
  );

  const enlace = crearElemento("a", {
    clase: "boton boton--secundario mascota-resumen__accion",
    texto: "Ver perfil",
    atributos: { href: `/mascota.html?id=${encodeURIComponent(String(mascota.id))}` }
  });
  enlace.append(crearIcono("flecha"));
  cuerpo.append(encabezado, datos, enlace);
  tarjeta.append(foto, cuerpo);
  return tarjeta;
}

/** Muestra un estado vacío con la acción adecuada cuando el usuario aún no tiene mascotas. */
function renderizarMascotasVacias(contenedor) {
  finalizarCarga(contenedor);
  const estado = crearElemento("div", { clase: "inicio-estado" });
  const icono = crearElemento("span", { clase: "inicio-estado__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("huella"));
  estado.append(
    icono,
    crearElemento("h3", { texto: "Todavía no has registrado mascotas" }),
    crearElemento("p", { texto: "Agrega tu primera mascota para organizar su información, consultar sus vacunas y hacer seguimiento a sus cuidados." })
  );
  const boton = crearElemento("a", {
    clase: "boton",
    texto: "Agregar mi primera mascota",
    atributos: { href: RUTAS.mascotas }
  });
  boton.prepend(crearIcono("agregar"));
  estado.append(boton);
  contenedor.replaceChildren(estado);
}

/** Normaliza los campos de fecha de los dos tipos de evento sin cambiar los datos recibidos. */
function obtenerFechaEvento(evento) {
  return evento.fecha_evento || evento.fecha_cita || evento.proxima_dosis || null;
}

/** Ordena las próximas citas y dosis por fecha y hora local. */
function compararEventos(a, b) {
  const fechaA = obtenerFechaEvento(a);
  const fechaB = obtenerFechaEvento(b);
  const horaA = a.hora_evento || a.hora_cita || "00:00";
  const horaB = b.hora_evento || b.hora_cita || "00:00";
  const marcaA = new Date(`${fechaA || "9999-12-31"}T${horaA}`).getTime();
  const marcaB = new Date(`${fechaB || "9999-12-31"}T${horaB}`).getTime();
  return marcaA - marcaB;
}

/** Presenta el estado derivado de la cita; una dosis próxima usa una etiqueta informativa. */
function crearEstadoEvento(evento) {
  const pastilla = crearElemento("span", { clase: "pastilla" });
  if (evento.tipo_evento === "vacuna") {
    pastilla.classList.add("pastilla--proxima");
    pastilla.textContent = "Próxima dosis";
    return pastilla;
  }

  if (!evento.estado) return null;
  const estado = textoSeguro(evento.estado).toLowerCase();
  const etiquetas = {
    pendiente: ["Pendiente", "pastilla--pendiente"],
    confirmada: ["Confirmada", "pastilla--confirmada"],
    completada: ["Completada", "pastilla--completada"],
    cancelada: ["Cancelada", "pastilla--cancelada"]
  };
  const [etiqueta, clase] = etiquetas[estado] || [estado || "Cita", ""];
  if (clase) pastilla.classList.add(clase);
  pastilla.textContent = etiqueta;
  return pastilla;
}

/** Crea una línea del calendario a partir de la respuesta de GET /api/inicio/eventos. */
function crearTarjetaEvento(evento) {
  const tipo = evento.tipo_evento === "vacuna" ? "vacuna" : "cita";
  const tarjeta = crearElemento("article", { clase: "evento" });
  const icono = crearElemento("span", { clase: "evento__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono(tipo));
  tarjeta.classList.add(`evento--${tipo}`);

  const contenido = crearElemento("div", { clase: "evento__contenido" });
  contenido.append(
    crearElemento("h3", { clase: "evento__titulo", texto: evento.nombre_evento || (tipo === "vacuna" ? "Vacunación" : "Cita veterinaria") }),
    crearElemento("p", { clase: "evento__mascota", texto: evento.nombre_mascota || "Mascota" })
  );

  const meta = crearElemento("div", { clase: "evento__meta" });
  const fecha = obtenerFechaEvento(evento);
  const fechaHora = fecha ? formatearFecha(fecha) : "Fecha no disponible";
  const hora = evento.hora_evento || evento.hora_cita;
  const fechaTexto = hora ? `${fechaHora} · ${formatearHora(hora)}` : fechaHora;
  meta.append(
    crearElemento("span", { clase: "evento__fecha", texto: fechaTexto }),
  );
  const estado = crearEstadoEvento({ ...evento, tipo_evento: tipo });
  if (estado) meta.append(estado);
  contenido.append(meta);
  tarjeta.append(icono, contenido);
  return tarjeta;
}

/** Renderiza una indicación útil cuando el servidor no devuelve eventos próximos. */
function renderizarEventosVacios(contenedor) {
  finalizarCarga(contenedor);
  const estado = crearElemento("div", { clase: "inicio-estado" });
  const icono = crearElemento("span", { clase: "inicio-estado__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("calendario"));
  estado.append(
    icono,
    crearElemento("h3", { texto: "No tienes eventos próximos" }),
    crearElemento("p", { texto: "Cuando se registren próximas citas o dosis de vacunas para tus mascotas, aparecerán aquí." })
  );
  contenedor.replaceChildren(estado);
}

/** Sustituye un área por un estado de error con una acción para volver a consultar la API. */
function renderizarErrorSeccion(contenedor, mensaje, reintentar) {
  finalizarCarga(contenedor);
  const bloque = crearElemento("div", { clase: "inicio-error-seccion", role: "alert" });
  bloque.append(crearElemento("p", { texto: mensaje || "No fue posible cargar esta información." }));
  const boton = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
  boton.addEventListener("click", reintentar, { once: true });
  bloque.append(boton);
  contenedor.replaceChildren(bloque);
}

/** Dibuja bloques de carga en una región mientras se consulta el backend. */
function renderizarCarga(contenedor, cantidad = 2) {
  contenedor.setAttribute("role", "status");
  contenedor.setAttribute("aria-label", "Cargando información");
  contenedor.setAttribute("aria-busy", "true");
  const fragmento = document.createDocumentFragment();
  const tipo = contenedor.classList.contains("inicio-indicadores") ? "indicador" :
    contenedor.classList.contains("mascotas-rejilla") ? "mascota" : "evento";
  for (let indice = 0; indice < cantidad; indice += 1) {
    fragmento.append(crearElemento("div", { clase: `inicio-cargando__bloque inicio-cargando__bloque--${tipo}` }));
  }
  contenedor.replaceChildren(fragmento);
}

/** Retira el estado accesible de carga cuando se sustituye por datos, vacío o error. */
function finalizarCarga(contenedor) {
  contenedor.removeAttribute("role");
  contenedor.removeAttribute("aria-label");
  contenedor.setAttribute("aria-busy", "false");
}

/** Carga el resumen de Inicio sin fabricar valores en caso de respuesta incompleta. */
async function cargarResumen(contenedor) {
  renderizarCarga(contenedor, 1);
  try {
    const respuesta = await api.inicio.obtenerResumen();
    renderizarIndicadores(contenedor, respuesta?.resumen);
  } catch (error) {
    renderizarErrorSeccion(contenedor, mensajeError(error), () => cargarResumen(contenedor));
  }
}

/** Obtiene hasta tres mascotas activas del usuario y muestra su estado vacío si no existen. */
async function cargarMascotas(contenedor) {
  renderizarCarga(contenedor, 3);
  try {
    const respuesta = await api.mascotas.listar({ limite: 3, activa: true });
    const mascotas = Array.isArray(respuesta?.datos) ? respuesta.datos.slice(0, 3) : [];
    if (!mascotas.length) {
      renderizarMascotasVacias(contenedor);
      return;
    }
    finalizarCarga(contenedor);
    const fragmento = document.createDocumentFragment();
    for (const mascota of mascotas) fragmento.append(crearTarjetaMascota(mascota));
    contenedor.replaceChildren(fragmento);
  } catch (error) {
    renderizarErrorSeccion(contenedor, mensajeError(error), () => cargarMascotas(contenedor));
  }
}

/** Carga y ordena los eventos próximos antes de construir la lista accesible. */
async function cargarEventos(contenedor) {
  renderizarCarga(contenedor, 2);
  try {
    const respuesta = await api.inicio.listarEventos();
    const eventos = Array.isArray(respuesta?.datos) ? [...respuesta.datos] : [];
    eventos.sort(compararEventos);
    if (!eventos.length) {
      renderizarEventosVacios(contenedor);
      return;
    }
    finalizarCarga(contenedor);
    const fragmento = document.createDocumentFragment();
    for (const evento of eventos) fragmento.append(crearTarjetaEvento(evento));
    contenedor.replaceChildren(fragmento);
  } catch (error) {
    renderizarErrorSeccion(contenedor, mensajeError(error), () => cargarEventos(contenedor));
  }
}

/** Devuelve un mensaje seguro del error de red o del formato { error, campos }. */
function mensajeError(error) {
  if (error instanceof ApiError) return error.error || error.message;
  return error?.message || "No fue posible cargar la información. Comprueba tu conexión e inténtalo nuevamente.";
}

/** Crea la bienvenida de usuario y el contenedor de las cuatro tarjetas indicadoras. */
function crearBienvenida(nombreCompleto) {
  const bienvenida = crearElemento("section", { clase: "inicio-bienvenida", atributos: { "aria-labelledby": "inicio-saludo" } });
  const texto = crearElemento("div", { clase: "inicio-bienvenida__texto" });
  const etiqueta = crearElemento("p", { clase: "inicio-bienvenida__etiqueta" });
  etiqueta.append(crearIcono("estrella"), document.createTextNode("Tu espacio de cuidado"));
  texto.append(
    etiqueta,
    crearElemento("h2", { texto: `¡Hola, ${obtenerNombreCorto(nombreCompleto)}!`, atributos: { id: "inicio-saludo" } }),
    crearElemento("p", { texto: "Todo lo que necesitas para cuidar de tus mascotas." })
  );
  const huella = crearElemento("span", { clase: "inicio-bienvenida__huella", atributos: { "aria-hidden": "true" } });
  huella.append(crearIcono("huella"));
  bienvenida.append(texto, huella);
  return bienvenida;
}

/** Construye el encabezado de cada sección con un título y un enlace opcional. */
function crearEncabezadoSeccion(titulo, descripcion, enlaceTexto, enlaceRuta) {
  const encabezado = crearElemento("div", { clase: "inicio-seccion__encabezado" });
  const texto = crearElemento("div");
  texto.append(
    crearElemento("h2", { clase: "inicio-seccion__titulo", texto: titulo }),
    crearElemento("p", { clase: "inicio-seccion__descripcion", texto: descripcion })
  );
  encabezado.append(texto);
  if (enlaceTexto && enlaceRuta) {
    const enlace = crearElemento("a", { clase: "inicio-enlace", texto: enlaceTexto, atributos: { href: enlaceRuta } });
    enlace.append(crearIcono("flecha"));
    encabezado.append(enlace);
  }
  return encabezado;
}

/** Crea el contenido de Inicio que se introduce dentro del main generado por el layout compartido. */
function construirInicio(contenedor, sesion) {
  const contenido = crearElemento("div", { clase: "inicio-contenido" });
  contenido.append(crearBienvenida(sesion.usuario.nombre_completo));

  const seccionIndicadores = crearElemento("section", { clase: "inicio-seccion", atributos: { "aria-label": "Resumen de tu actividad" } });
  const indicadores = crearElemento("div", { clase: "inicio-indicadores", atributos: { "aria-live": "polite" } });
  renderizarCarga(indicadores, 4);
  seccionIndicadores.append(indicadores);

  const seccionMascotas = crearElemento("section", { clase: "inicio-seccion", atributos: { "aria-labelledby": "titulo-mis-mascotas" } });
  const encabezadoMascotas = crearEncabezadoSeccion("Mis mascotas", "Consulta rápidamente la información de tus compañeros.", "Ver todas", RUTAS.mascotas);
  encabezadoMascotas.querySelector("h2")?.setAttribute("id", "titulo-mis-mascotas");
  const mascotas = crearElemento("div", { clase: "mascotas-rejilla", atributos: { "aria-live": "polite" } });
  renderizarCarga(mascotas, 3);
  seccionMascotas.append(encabezadoMascotas, mascotas);

  const seccionEventos = crearElemento("section", { clase: "inicio-seccion", atributos: { "aria-labelledby": "titulo-proximos-eventos" } });
  const encabezadoEventos = crearEncabezadoSeccion("Próximos eventos", "Tus próximas citas y dosis de vacunas, ordenadas por fecha.", "Ver citas", "/citas.html");
  encabezadoEventos.querySelector("h2")?.setAttribute("id", "titulo-proximos-eventos");
  const eventos = crearElemento("div", { clase: "inicio-eventos", atributos: { "aria-live": "polite" } });
  renderizarCarga(eventos, 2);
  seccionEventos.append(encabezadoEventos, eventos);

  const asistente = crearElemento("section", { clase: "inicio-asistente", atributos: { "aria-labelledby": "inicio-asistente-titulo" } });
  const texto = crearElemento("div", { clase: "inicio-asistente__contenido" });
  texto.append(
    crearElemento("h2", { texto: "¿Tienes alguna duda?", atributos: { id: "inicio-asistente-titulo" } }),
    crearElemento("p", { texto: "Conversa con PetCare AI y encuentra orientación para el cuidado diario de tus mascotas." })
  );
  const botonAsistente = crearElemento("a", { clase: "boton", texto: "Hablar con el asistente", atributos: { href: RUTAS.asistente } });
  botonAsistente.append(crearIcono("flecha"));
  asistente.append(texto, botonAsistente);

  contenido.append(seccionIndicadores, seccionMascotas, seccionEventos, asistente,
    crearElemento("p", { clase: "inicio-pie", texto: "PetCare · El cuidado de tu mascota, en un solo lugar." })
  );
  contenedor.replaceChildren(contenido);

  return { indicadores, mascotas, eventos };
}

/** Renderiza un mensaje recuperable si no es posible validar la sesión con el servidor. */
function mostrarErrorSesion(contenedor, error) {
  contenedor.setAttribute("aria-busy", "false");
  const tarjeta = crearElemento("section", { clase: "inicio-sesion-error__tarjeta" });
  const icono = crearElemento("span", { clase: "inicio-sesion-error__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("alerta"));
  tarjeta.append(
    icono,
    crearElemento("h1", { texto: "No pudimos conectar con PetCare" }),
    crearElemento("p", { texto: mensajeError(error) })
  );
  const reintentar = crearElemento("button", { clase: "boton", texto: "Volver a intentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", iniciar, { once: true });
  const login = crearElemento("a", { clase: "boton boton--secundario", texto: "Ir al inicio de sesión", atributos: { href: RUTAS.login } });
  const acciones = crearElemento("div", { clase: "pagina-error__acciones" });
  acciones.append(reintentar, login);
  tarjeta.append(acciones);
  const region = crearElemento("main", { clase: "inicio-sesion-error", atributos: { role: "alert" } });
  region.append(tarjeta);
  contenedor.replaceChildren(region);
}

/** Ejecuta la protección por rol y después carga las tres regiones de datos en paralelo. */
async function iniciar() {
  const raiz = document.querySelector("#app");
  if (!raiz) return;
  raiz.setAttribute("aria-busy", "true");

  let sesion;
  try {
    sesion = await protegerPagina({
      roles: ["usuario"],
      loginUrl: RUTAS.login,
      inicioUrl: RUTAS.admin
    });
  } catch (error) {
    mostrarErrorSesion(raiz, error);
    return;
  }

  if (!sesion) return;

  try {
    const layout = montarLayout({
      contenedor: raiz,
      sesion,
      titulo: "Inicio",
      paginaActual: "/inicio.html",
      contadorNotificaciones: sesion.notificaciones_sin_leer
    });
    const regiones = construirInicio(layout.contenido, sesion);
    raiz.setAttribute("aria-busy", "false");
    await Promise.all([
      cargarResumen(regiones.indicadores),
      cargarMascotas(regiones.mascotas),
      cargarEventos(regiones.eventos)
    ]);
  } catch (error) {
    mostrarErrorSesion(raiz, error);
  }
}

iniciar();
