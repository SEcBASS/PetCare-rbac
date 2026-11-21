/**
 * Directorio de veterinarias para usuarios y administradores de PetCare.
 * Toda la información llega desde la API; esta página no crea ni modifica catálogos.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { debounce, textoSeguro } from "./utils.js";

const estado = {
  sesion: null,
  veterinarias: [],
  busqueda: "",
  solo24h: false,
  orden: "",
  ubicacion: null,
  ubicacionActiva: false,
  mensajeUbicacion: "",
  secuenciaListado: 0,
  secuenciaUbicacion: 0,
  secuenciaDetalle: 0,
  regiones: null,
  dialogo: null,
  ultimoError: null
};

const DIAS_SEMANA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_CORTOS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const ICONOS = {
  clinica: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-8h6v8", "M9 8h.01", "M15 8h.01"],
  buscar: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
  reloj: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  estrella: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9L12 3Z"],
  ubicacion: ["M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z", "M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  telefono: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 8.9a16 16 0 0 0 6 6l.2-.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2Z"],
  correo: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "m22 7-10 7L2 7"],
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
  emergencia: ["M12 2v20", "M2 12h20"]
};

/** Crea elementos y asigna texto plano para no interpretar datos recibidos del servidor. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un icono SVG cuyos trazos son constantes del propio módulo. */
function crearIcono(nombre, clase = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (clase) svg.setAttribute("class", clase);
  for (const trazo of ICONOS[nombre] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", trazo);
    svg.append(path);
  }
  return svg;
}

/** Convierte la respuesta de colección en un arreglo sin fabricar registros. */
function obtenerColeccion(respuesta, clave = "datos") {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.[clave]) ? respuesta[clave] : [];
}

/** Obtiene una hora legible a partir del formato TIME de MySQL. */
function formatearHora(valor) {
  if (typeof valor !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(valor)) return "Hora no registrada";
  const [horaTexto, minutoTexto] = valor.split(":");
  const hora24 = Number(horaTexto);
  const minuto = Number(minutoTexto);
  if (hora24 > 23 || minuto > 59) return "Hora no registrada";
  const periodo = hora24 < 12 ? "a. m." : "p. m.";
  const hora12 = hora24 % 12 || 12;
  return `${hora12}:${minutoTexto} ${periodo}`;
}

/** Agrupa horarios con la misma apertura y cierre para resumirlos en las tarjetas. */
function resumirHorarios(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) return "Horario no registrado";
  const validos = horarios
    .filter((horario) => Number.isInteger(Number(horario.dia_semana)) && Number(horario.dia_semana) >= 1 && Number(horario.dia_semana) <= 7)
    .sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana));
  if (!validos.length) return "Horario no registrado";

  const grupos = new Map();
  for (const horario of validos) {
    const apertura = horario.hora_apertura;
    const cierre = horario.hora_cierre;
    if (typeof apertura !== "string" || typeof cierre !== "string") continue;
    const clave = `${apertura}|${cierre}`;
    if (!grupos.has(clave)) grupos.set(clave, { apertura, cierre, dias: [] });
    grupos.get(clave).dias.push(Number(horario.dia_semana));
  }
  const resumenes = [...grupos.values()].map((grupo) => {
    const dias = grupo.dias.map((dia) => DIAS_CORTOS[dia]).join(", ");
    return `${dias}: ${formatearHora(grupo.apertura)} – ${formatearHora(grupo.cierre)}`;
  });
  return resumenes.length ? resumenes.slice(0, 2).join(" · ") : "Horario no registrado";
}

/** Acepta únicamente números finitos para calificaciones, reseñas y distancia. */
function numeroFinito(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Normaliza los valores que el backend entrega para las etiquetas de una veterinaria. */
function obtenerEtiquetas(veterinaria) {
  if (!Array.isArray(veterinaria?.etiquetas)) return [];
  return [...new Set(veterinaria.etiquetas
    .filter((etiqueta) => typeof etiqueta === "string")
    .map((etiqueta) => etiqueta.trim())
    .filter(Boolean))];
}

/** Construye la dirección visible utilizando únicamente los campos registrados. */
function obtenerDireccion(veterinaria) {
  const partes = [veterinaria?.direccion, veterinaria?.ciudad, veterinaria?.pais]
    .filter((parte) => typeof parte === "string" && parte.trim());
  return partes.length ? partes.join(", ") : "Dirección no registrada";
}

/** Muestra los mensajes de ubicación sin revelar ni persistir las coordenadas. */
function actualizarAvisoUbicacion() {
  const aviso = estado.regiones?.avisoUbicacion;
  if (!aviso) return;
  aviso.textContent = estado.mensajeUbicacion;
  aviso.hidden = !estado.mensajeUbicacion;
  aviso.classList.toggle("veterinarias-aviso--info", estado.ubicacionActiva);
}

/** Actualiza el estado visual de los tres filtros accesibles. */
function actualizarFiltros() {
  if (!estado.regiones) return;
  estado.regiones.filtro24h.setAttribute("aria-pressed", String(estado.solo24h));
  estado.regiones.filtroValoracion.setAttribute("aria-pressed", String(estado.orden === "calificacion_promedio"));
  estado.regiones.filtroCercania.setAttribute("aria-pressed", String(estado.ubicacionActiva));
}

/** Construye el encabezado, buscador, filtros y región de resultados del módulo. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "veterinarias-pagina" });
  const intro = crearElemento("header", { clase: "veterinarias-intro" });
  const sobrelinea = crearElemento("p", { clase: "veterinarias-intro__sobrelinea" });
  sobrelinea.append(crearIcono("clinica"), document.createTextNode("Directorio de atención veterinaria"));
  intro.append(
    sobrelinea,
    crearElemento("h2", { texto: "Veterinarias", atributos: { id: "veterinarias-titulo" } }),
    crearElemento("p", { texto: "Encuentra el mejor cuidado para tu mascota" })
  );

  const controles = crearElemento("section", { clase: "veterinarias-controles", atributos: { "aria-label": "Buscar y filtrar veterinarias" } });
  const buscador = crearElemento("label", { clase: "veterinarias-buscador" });
  buscador.append(crearIcono("buscar", "veterinarias-buscador__icono"));
  const campoBusqueda = crearElemento("input", {
    atributos: {
      id: "buscar-veterinarias",
      name: "q",
      type: "search",
      autocomplete: "off",
      placeholder: "Buscar por nombre, dirección o ciudad",
      "aria-label": "Buscar veterinarias por nombre, dirección o ciudad"
    }
  });
  campoBusqueda.addEventListener("input", () => cambiarBusqueda(campoBusqueda.value));
  buscador.append(campoBusqueda);

  const filtros = crearElemento("div", { clase: "veterinarias-filtros", role: "group", atributos: { "aria-label": "Filtros de veterinarias" } });
  const filtro24h = crearElemento("button", { clase: "veterinarias-filtro", texto: "Emergencias 24h", atributos: { type: "button", "aria-pressed": "false" } });
  filtro24h.prepend(crearIcono("reloj"));
  filtro24h.addEventListener("click", () => {
    estado.solo24h = !estado.solo24h;
    actualizarFiltros();
    cargarVeterinarias();
  });

  const filtroValoracion = crearElemento("button", { clase: "veterinarias-filtro", texto: "Mejor valoradas", atributos: { type: "button", "aria-pressed": "false" } });
  filtroValoracion.prepend(crearIcono("estrella"));
  filtroValoracion.addEventListener("click", () => {
    estado.secuenciaUbicacion += 1;
    estado.regiones.filtroCercania.disabled = false;
    estado.ubicacion = null;
    estado.ubicacionActiva = false;
    estado.orden = estado.orden === "calificacion_promedio" ? "" : "calificacion_promedio";
    estado.mensajeUbicacion = "";
    actualizarFiltros();
    actualizarAvisoUbicacion();
    cargarVeterinarias();
  });

  const filtroCercania = crearElemento("button", { clase: "veterinarias-filtro", texto: "Más cercanas", atributos: { type: "button", "aria-pressed": "false" } });
  filtroCercania.prepend(crearIcono("ubicacion"));
  filtroCercania.addEventListener("click", alternarCercania);
  filtros.append(filtro24h, filtroValoracion, filtroCercania);
  const avisoUbicacion = crearElemento("p", {
    clase: "veterinarias-aviso",
    atributos: { role: "status", "aria-live": "polite", hidden: "" }
  });
  controles.append(buscador, filtros, avisoUbicacion);

  const resultados = crearElemento("section", { clase: "veterinarias-resultados", atributos: { "aria-labelledby": "veterinarias-resultados-titulo" } });
  const encabezadoResultados = crearElemento("header", { clase: "veterinarias-resultados__encabezado" });
  encabezadoResultados.append(
    crearElemento("h3", { texto: "Directorio de veterinarias", atributos: { id: "veterinarias-resultados-titulo" } }),
    crearElemento("p", { clase: "veterinarias-resultados__cantidad", texto: "Consultando directorio…", atributos: { id: "veterinarias-cantidad", "aria-live": "polite" } })
  );
  const lista = crearElemento("div", { clase: "veterinarias-grid", atributos: { id: "veterinarias-lista", "aria-live": "polite", "aria-busy": "true" } });
  resultados.append(encabezadoResultados, lista);
  pagina.append(intro, controles, resultados);
  contenedor.replaceChildren(pagina);

  estado.regiones = { campoBusqueda, filtro24h, filtroValoracion, filtroCercania, avisoUbicacion, cantidad: encabezadoResultados.querySelector("#veterinarias-cantidad"), lista };
  renderizarCarga();
}

/** Refleja el buscador superior del layout en el buscador de esta sección. */
function cambiarBusqueda(valor) {
  estado.busqueda = textoSeguro(valor).trim();
  if (estado.regiones && estado.regiones.campoBusqueda.value !== valor) {
    estado.regiones.campoBusqueda.value = valor;
  }
  cargarVeterinariasDebounced();
}

const cargarVeterinariasDebounced = debounce(() => cargarVeterinarias(), 300);

/** Solicita ubicación solo cuando la persona activa el filtro «Más cercanas». */
function alternarCercania() {
  estado.secuenciaUbicacion += 1;
  const secuencia = estado.secuenciaUbicacion;

  if (estado.ubicacionActiva) {
    estado.ubicacionActiva = false;
    estado.ubicacion = null;
    estado.orden = "";
    estado.mensajeUbicacion = "";
    actualizarFiltros();
    actualizarAvisoUbicacion();
    cargarVeterinarias();
    return;
  }

  if (!navigator.geolocation || !window.isSecureContext) {
    estado.ubicacionActiva = false;
    estado.ubicacion = null;
    estado.orden = "";
    estado.mensajeUbicacion = "No podemos ordenar por cercanía porque este navegador no permite compartir la ubicación en esta página. La función requiere un contexto seguro (HTTPS o localhost). Puedes seguir usando la búsqueda y los demás filtros.";
    actualizarFiltros();
    actualizarAvisoUbicacion();
    cargarVeterinarias();
    return;
  }

  estado.mensajeUbicacion = "Solicitando permiso de ubicación al navegador…";
  actualizarAvisoUbicacion();
  estado.regiones.filtroCercania.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      if (secuencia !== estado.secuenciaUbicacion) return;
      const lat = Number(posicion.coords.latitude);
      const lng = Number(posicion.coords.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        resolverErrorUbicacion(secuencia, "El navegador no entregó coordenadas válidas. No es posible ordenar por distancia.");
        return;
      }
      estado.ubicacion = { lat, lng };
      estado.ubicacionActiva = true;
      estado.orden = "distancia";
      estado.mensajeUbicacion = "Mostrando primero las veterinarias más cercanas a la ubicación compartida con el navegador.";
      estado.regiones.filtroCercania.disabled = false;
      actualizarFiltros();
      actualizarAvisoUbicacion();
      cargarVeterinarias();
    },
    (error) => {
      let mensaje = "No podemos ordenar por cercanía porque no fue posible obtener tu ubicación.";
      if (error?.code === 1) mensaje = "No podemos ordenar por cercanía porque el navegador no permitió compartir tu ubicación. Puedes habilitar el permiso desde la configuración del sitio y volver a intentarlo.";
      if (error?.code === 2) mensaje = "No podemos ordenar por cercanía porque el dispositivo no pudo determinar tu ubicación. Comprueba que la ubicación esté activada e inténtalo nuevamente.";
      if (error?.code === 3) mensaje = "La solicitud de ubicación tardó demasiado. No se aplicó el orden por cercanía; puedes volver a intentarlo.";
      resolverErrorUbicacion(secuencia, mensaje);
    },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 12000 }
  );
}

/** Restablece el orden normal y avisa de manera explícita cuando falla la geolocalización. */
function resolverErrorUbicacion(secuencia, mensaje) {
  if (secuencia !== estado.secuenciaUbicacion) return;
  estado.ubicacion = null;
  estado.ubicacionActiva = false;
  estado.orden = "";
  estado.mensajeUbicacion = mensaje;
  estado.regiones.filtroCercania.disabled = false;
  actualizarFiltros();
  actualizarAvisoUbicacion();
  cargarVeterinarias();
}

/** Construye los parámetros exactos de GET /api/veterinarias. */
function obtenerParametrosListado() {
  return {
    q: estado.busqueda,
    "24h": estado.solo24h ? "true" : "",
    orden: estado.orden,
    lat: estado.ubicacionActiva ? estado.ubicacion?.lat : "",
    lng: estado.ubicacionActiva ? estado.ubicacion?.lng : ""
  };
}

/** Consulta el catálogo, ignora respuestas antiguas y conserva los errores del servidor. */
async function cargarVeterinarias() {
  const secuencia = ++estado.secuenciaListado;
  renderizarCarga();
  estado.regiones.cantidad.textContent = "Consultando directorio…";

  try {
    const respuesta = await api.veterinarias.listar(obtenerParametrosListado());
    if (secuencia !== estado.secuenciaListado) return;
    estado.veterinarias = obtenerColeccion(respuesta);
    estado.ultimoError = null;
    renderizarVeterinarias();
  } catch (error) {
    if (secuencia !== estado.secuenciaListado) return;
    estado.ultimoError = error;
    renderizarErrorListado(error);
  }
}

/** Muestra esqueletos visuales mientras llega la respuesta real del backend. */
function renderizarCarga() {
  const lista = estado.regiones?.lista;
  if (!lista) return;
  lista.setAttribute("aria-busy", "true");
  const carga = crearElemento("div", { clase: "veterinarias-carga", atributos: { "aria-hidden": "true" } });
  for (let indice = 0; indice < 3; indice += 1) {
    carga.append(crearElemento("div", { clase: "veterinaria-esqueleto" }));
  }
  lista.replaceChildren(carga);
}

/** Dibuja el directorio o los estados vacíos según los datos recibidos. */
function renderizarVeterinarias() {
  const lista = estado.regiones.lista;
  lista.setAttribute("aria-busy", "false");
  estado.regiones.cantidad.textContent = estado.veterinarias.length === 1
    ? "1 veterinaria encontrada"
    : `${estado.veterinarias.length} veterinarias encontradas`;

  if (!estado.veterinarias.length) {
    const sinResultados = estado.busqueda || estado.solo24h || estado.ubicacionActiva || estado.orden;
    const vacio = crearEstado(
      "clinica",
      sinResultados ? "No encontramos coincidencias" : "Todavía no hay veterinarias disponibles",
      sinResultados
        ? "Prueba con otra búsqueda o cambia los filtros para consultar otras veterinarias."
        : "Cuando el administrador registre veterinarias activas, aparecerán aquí con sus datos de contacto y horarios."
    );
    lista.replaceChildren(vacio);
    return;
  }

  const fragmento = document.createDocumentFragment();
  for (const veterinaria of estado.veterinarias) {
    fragmento.append(crearTarjetaVeterinaria(veterinaria));
  }
  lista.replaceChildren(fragmento);
}

/** Crea un estado vacío o de error con elementos accesibles y sin datos de muestra. */
function crearEstado(icono, titulo, descripcion) {
  const bloque = crearElemento("section", { clase: "veterinarias-estado" });
  const simbolo = crearElemento("span", { clase: "veterinarias-estado__icono", atributos: { "aria-hidden": "true" } });
  simbolo.append(crearIcono(icono));
  bloque.append(
    simbolo,
    crearElemento("h4", { texto: titulo }),
    crearElemento("p", { texto: descripcion })
  );
  return bloque;
}

/** Construye una pastilla de etiqueta únicamente si existe en la respuesta del backend. */
function crearGrupoEtiquetas(veterinaria) {
  const etiquetas = obtenerEtiquetas(veterinaria);
  if (!etiquetas.length) return null;
  const grupo = crearElemento("div", { clase: "veterinaria-tarjeta__etiquetas", atributos: { "aria-label": "Etiquetas de la veterinaria" } });
  for (const etiqueta of etiquetas) {
    grupo.append(crearElemento("span", { clase: "veterinaria-etiqueta", texto: etiqueta }));
  }
  return grupo;
}

/** Crea una tarjeta con los datos reales de VETERINARIAS y alias opcionales de presentación. */
function atiendeVeinticuatroHoras(veterinaria) {
  return veterinaria?.atiende_24h === true || veterinaria?.atiende_24h === 1 || veterinaria?.atiende_24h === "1" || veterinaria?.atiende_24h === "true";
}

/** Construye una tarjeta con los datos reales de VETERINARIAS y alias opcionales de presentación. */
function crearTarjetaVeterinaria(veterinaria) {
  const tarjeta = crearElemento("article", { clase: "veterinaria-tarjeta" });
  const encabezado = crearElemento("header", { clase: "veterinaria-tarjeta__encabezado" });
  const identidad = crearElemento("div", { clase: "veterinaria-tarjeta__identidad" });
  identidad.append(crearElemento("h4", { clase: "veterinaria-tarjeta__nombre", texto: veterinaria.nombre || "Nombre no registrado" }));
  if (atiendeVeinticuatroHoras(veterinaria)) {
    const insignia = crearElemento("span", { clase: "veterinaria-tarjeta__insignia", texto: "Emergencias 24h" });
    insignia.prepend(crearIcono("reloj"));
    identidad.append(insignia);
  }
  encabezado.append(identidad);

  const calificacion = crearElemento("p", { clase: "veterinaria-tarjeta__calificacion" });
  const puntuacion = numeroFinito(veterinaria.calificacion_promedio);
  const resenas = numeroFinito(veterinaria.numero_resenas);
  if (puntuacion !== null) {
    calificacion.append(
      crearIcono("estrella", "veterinaria-tarjeta__estrella"),
      crearElemento("strong", { clase: "veterinaria-tarjeta__valoracion", texto: puntuacion.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    );
    if (resenas !== null) calificacion.append(document.createTextNode(`(${resenas.toLocaleString("es-CO")} reseñas)`));
  } else {
    calificacion.textContent = "Calificación no disponible";
  }
  encabezado.append(calificacion);

  const datos = crearElemento("div", { clase: "veterinaria-tarjeta__datos" });
  datos.append(crearDato("ubicacion", obtenerDireccion(veterinaria)));
  const horario = typeof veterinaria.horario_resumen === "string" && veterinaria.horario_resumen.trim()
    ? veterinaria.horario_resumen.trim()
    : atiendeVeinticuatroHoras(veterinaria)
      ? "Atención continua · 24 horas"
      : resumirHorarios(veterinaria.horarios);
  datos.append(crearDato("reloj", horario));

  const etiquetas = crearGrupoEtiquetas(veterinaria);
  if (etiquetas) datos.append(etiquetas);

  const pie = crearElemento("footer", { clase: "veterinaria-tarjeta__pie" });
  const distancia = numeroFinito(veterinaria.distancia_km);
  pie.append(crearElemento("span", {
    clase: "veterinaria-tarjeta__distancia",
    texto: distancia !== null ? `${distancia.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km` : ""
  }));
  const boton = crearElemento("button", { clase: "boton boton--secundario veterinaria-tarjeta__accion", texto: "Ver info", atributos: { type: "button" } });
  boton.addEventListener("click", () => abrirDetalleVeterinaria(veterinaria.id, boton));
  pie.append(boton);

  tarjeta.append(encabezado, datos, pie);
  return tarjeta;
}

/** Crea un dato con su icono decorativo. */
function crearDato(icono, texto) {
  const dato = crearElemento("p", { clase: "veterinaria-tarjeta__dato" });
  dato.append(crearIcono(icono), crearElemento("span", { texto }));
  return dato;
}

/** Crea o reutiliza el único diálogo modal de detalles. */
function obtenerDialogo() {
  if (estado.dialogo) return estado.dialogo;
  const dialogo = crearElemento("dialog", {
    clase: "veterinarias-dialogo",
    atributos: { "aria-labelledby": "veterinarias-dialogo-titulo" }
  });
  const interior = crearElemento("div", { clase: "veterinarias-dialogo__interior" });
  dialogo.append(interior);
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
  dialogo.addEventListener("close", () => {
    estado.secuenciaDetalle += 1;
    const foco = estado.botonDetalleAnterior;
    estado.botonDetalleAnterior = null;
    if (foco?.isConnected) foco.focus();
  });
  document.body.append(dialogo);
  estado.dialogo = dialogo;
  estado.contenidoDialogo = interior;
  return dialogo;
}

/** Abre el modal y consulta el detalle real de la veterinaria seleccionada. */
async function abrirDetalleVeterinaria(id, botonOrigen) {
  if (id === undefined || id === null || id === "") return;
  const dialogo = obtenerDialogo();
  const secuencia = ++estado.secuenciaDetalle;
  estado.botonDetalleAnterior = botonOrigen;
  botonOrigen.disabled = true;
  estado.contenidoDialogo.replaceChildren(crearEstado("clinica", "Cargando información", "Consultando los datos de contacto y horarios de la veterinaria…"));
  if (!dialogo.open) dialogo.showModal();

  try {
    const respuesta = await api.veterinarias.obtener(id);
    if (secuencia !== estado.secuenciaDetalle || !dialogo.open) return;
    const veterinaria = respuesta?.veterinaria;
    if (!veterinaria || typeof veterinaria !== "object") {
      throw new Error("El servidor no devolvió el detalle de esta veterinaria.");
    }
    const horarios = obtenerColeccion(respuesta?.horarios, "datos");
    renderizarDetalle(veterinaria, horarios);
  } catch (error) {
    if (secuencia !== estado.secuenciaDetalle || !dialogo.open) return;
    renderizarErrorDetalle(error, id);
  } finally {
    botonOrigen.disabled = false;
  }
}

/** Construye el contenido del modal con datos de VETERINARIAS y HORARIOS_VETERINARIA. */
function renderizarDetalle(veterinaria, horarios) {
  const interior = estado.contenidoDialogo;
  const encabezado = crearElemento("header", { clase: "veterinarias-dialogo__encabezado" });
  const titulo = crearElemento("div", { clase: "veterinarias-dialogo__titulo" });
  titulo.append(
    crearElemento("h2", { texto: veterinaria.nombre || "Veterinaria", atributos: { id: "veterinarias-dialogo-titulo" } }),
    crearElemento("p", { texto: "Información de contacto y horarios de atención" })
  );
  const cerrar = crearElemento("button", { clase: "veterinarias-dialogo__cerrar", texto: "×", atributos: { type: "button", "aria-label": "Cerrar información" } });
  cerrar.addEventListener("click", () => estado.dialogo.close());
  encabezado.append(titulo, cerrar);

  const contacto = crearElemento("section", { clase: "veterinarias-dialogo__seccion", atributos: { "aria-label": "Datos de contacto" } });
  contacto.append(crearElemento("h3", { texto: "Contacto" }));
  const listaContacto = crearElemento("div", { clase: "veterinarias-dialogo__contacto" });
  const telefono = normalizarTelefono(veterinaria.telefono);
  if (telefono) {
    const enlaceTelefono = crearElemento("a", { texto: telefono.visible, atributos: { href: `tel:${telefono.href}` } });
    enlaceTelefono.prepend(crearIcono("telefono"));
    listaContacto.append(enlaceTelefono);
  } else {
    listaContacto.append(crearElemento("p", { texto: "Teléfono no registrado" }));
  }

  const correo = normalizarCorreo(veterinaria.correo);
  if (correo) {
    const enlaceCorreo = crearElemento("a", { texto: correo, atributos: { href: `mailto:${correo}` } });
    enlaceCorreo.prepend(crearIcono("correo"));
    listaContacto.append(enlaceCorreo);
  } else {
    listaContacto.append(crearElemento("p", { texto: "Correo no registrado" }));
  }
  listaContacto.append(crearElemento("p", { texto: obtenerDireccion(veterinaria) }));
  contacto.append(listaContacto);

  const seccionHorarios = crearElemento("section", { clase: "veterinarias-dialogo__seccion", atributos: { "aria-labelledby": "veterinarias-dialogo-horarios" } });
  seccionHorarios.append(crearElemento("h3", { texto: "Horario por día", atributos: { id: "veterinarias-dialogo-horarios" } }));
  const listaHorarios = crearElemento("div", { clase: "veterinarias-dialogo__horarios" });
  const ordenados = [...horarios].sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana));
  if (!ordenados.length) {
    listaHorarios.append(crearElemento("p", {
      texto: atiendeVeinticuatroHoras(veterinaria) ? "Atención continua · 24 horas" : "No hay horarios registrados."
    }));
  } else {
    for (const horario of ordenados) {
      const dia = Number(horario.dia_semana);
      if (!Number.isInteger(dia) || dia < 1 || dia > 7) continue;
      const fila = crearElemento("div", { clase: "veterinarias-dialogo__horario" });
      fila.append(
        crearElemento("strong", { texto: DIAS_SEMANA[dia] }),
        crearElemento("span", { texto: `${formatearHora(horario.hora_apertura)} – ${formatearHora(horario.hora_cierre)}` })
      );
      listaHorarios.append(fila);
    }
  }
  seccionHorarios.append(listaHorarios);

  const seccionEtiquetas = crearElemento("section", { clase: "veterinarias-dialogo__seccion" });
  seccionEtiquetas.append(crearElemento("h3", { texto: "Etiquetas" }));
  const etiquetas = crearGrupoEtiquetas(veterinaria);
  if (etiquetas) seccionEtiquetas.append(etiquetas);
  else seccionEtiquetas.append(crearElemento("p", { texto: "No hay etiquetas registradas." }));

  const pie = crearElemento("footer", { clase: "veterinarias-dialogo__pie" });
  const botonCerrar = crearElemento("button", { clase: "boton boton--secundario", texto: "Cerrar", atributos: { type: "button" } });
  botonCerrar.addEventListener("click", () => estado.dialogo.close());
  pie.append(botonCerrar);
  interior.replaceChildren(encabezado, contacto, seccionHorarios, seccionEtiquetas, pie);
}

/** Valida el teléfono antes de construir un enlace tel:. */
function normalizarTelefono(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const visible = valor.trim();
  if (!/^[+()\d\s.-]+$/.test(visible)) return null;
  const href = visible.replace(/(?!^\+)[^\d]/g, "");
  return href ? { visible, href } : null;
}

/** Valida el correo antes de construir un enlace mailto:. */
function normalizarCorreo(valor) {
  if (typeof valor !== "string") return null;
  const correo = valor.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null;
}

/** Presenta el error del detalle con la posibilidad de volver a consultar. */
function renderizarErrorDetalle(error, id) {
  const bloque = crearEstado("clinica", "No pudimos cargar la información", mensajeError(error));
  const boton = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
  boton.addEventListener("click", () => abrirDetalleVeterinaria(id, estado.botonDetalleAnterior || document.activeElement));
  const pie = crearElemento("footer", { clase: "veterinarias-dialogo__pie" });
  pie.append(boton);
  bloque.append(pie);
  estado.contenidoDialogo.replaceChildren(bloque);
}

/** Presenta un error de listado sin ocultar la opción de volver a intentar. */
function renderizarErrorListado(error) {
  const lista = estado.regiones.lista;
  lista.setAttribute("aria-busy", "false");
  estado.regiones.cantidad.textContent = "No fue posible consultar el directorio";
  const bloque = crearEstado("clinica", "No pudimos cargar las veterinarias", mensajeError(error));
  const boton = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
  boton.addEventListener("click", () => cargarVeterinarias());
  bloque.append(boton);
  lista.replaceChildren(bloque);
}

/** Extrae un mensaje entendible, respetando el formato de error del backend. */
function mensajeError(error) {
  if (error instanceof ApiError) return error.error || error.message;
  return error?.message || "Comprueba tu conexión e inténtalo nuevamente.";
}

/** Muestra una pantalla de error de sesión si la validación no pudo completarse. */
function mostrarErrorInicio(error) {
  const bloque = crearEstado("clinica", "No pudimos abrir el directorio", mensajeError(error));
  const boton = crearElemento("button", { clase: "boton", texto: "Volver a intentar", atributos: { type: "button" } });
  boton.addEventListener("click", iniciar);
  const contenedor = document.querySelector("#app");
  contenedor.setAttribute("aria-busy", "false");
  contenedor.replaceChildren(bloque);
  bloque.append(boton);
}

/** Inicia el módulo después de comprobar la sesión y el rol admitido. */
async function iniciar() {
  const contenedor = document.querySelector("#app");
  contenedor.setAttribute("aria-busy", "true");
  try {
    const sesion = await protegerPagina({
      roles: ["usuario", "administrador"],
      loginUrl: "/login.html",
      inicioUrl: "/inicio.html"
    });
    if (!sesion) return;
    estado.sesion = sesion;
    const layout = montarLayout({
      contenedor,
      sesion,
      titulo: "Veterinarias",
      onBuscar: (valor) => cambiarBusqueda(valor)
    });
    construirPagina(layout.contenido);
    actualizarFiltros();
    actualizarAvisoUbicacion();
    contenedor.setAttribute("aria-busy", "false");
    await cargarVeterinarias();
  } catch (error) {
    mostrarErrorInicio(error);
  }
}

iniciar();
