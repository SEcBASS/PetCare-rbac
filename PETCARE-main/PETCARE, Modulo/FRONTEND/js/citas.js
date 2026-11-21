/**
 * Módulo Citas para el rol usuario.
 * Toda la información se consulta desde GET /api/citas y el catálogo de mascotas.
 * El usuario no puede crear, editar ni cancelar citas desde esta pantalla.
 */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { formatearFecha, formatearHora, textoSeguro } from "./utils.js";

const RUTAS = {
  login: "/login.html",
  admin: "/admin-usuarios.html"
};

const ESTADOS = {
  confirmada: { etiqueta: "Confirmada", clase: "pastilla--confirmada" },
  pendiente: { etiqueta: "Pendiente", clase: "pastilla--pendiente" },
  completada: { etiqueta: "Completada", clase: "pastilla--completada" },
  cancelada: { etiqueta: "Cancelada", clase: "pastilla--cancelada" }
};

const ICONOS = {
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "M8 13h3", "M8 17h5"],
  reloj: ["M12 8v4l2.5 1.5", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  veterinaria: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-8h6v8"],
  huella: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  lista: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  alerta: ["M12 9v4", "M12 17h.01", "M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"]
};

const estado = {
  sesion: null,
  mascotas: [],
  citasLista: [],
  citasMes: [],
  vista: "lista",
  mes: mesActualISO(new Date()),
  fechaSeleccionada: fechaISO(new Date()),
  mascotaId: "",
  busqueda: "",
  listaCargada: false,
  listaFiltro: null,
  secuenciaLista: 0,
  calendarioCargado: false,
  calendarioMes: null,
  secuenciaCalendario: 0,
  regiones: null
};

/** Crea un nodo DOM y asigna siempre los datos dinámicos mediante textContent. */
function crearElemento(etiqueta, { clase = "", texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja un icono SVG usando exclusivamente trazos estáticos del módulo. */
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

/** Devuelve los registros desde las formas de colección documentadas por la API. */
function obtenerColeccion(respuesta, claves = ["datos", "citas", "mascotas"]) {
  if (Array.isArray(respuesta)) return respuesta;
  for (const clave of claves) {
    if (Array.isArray(respuesta?.[clave])) return respuesta[clave];
  }
  return [];
}

/** Construye YYYY-MM-DD usando la fecha local del navegador. */
function fechaISO(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Construye YYYY-MM para el parámetro de consulta del calendario mensual. */
function mesActualISO(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** Interpreta DATE de MySQL como fecha local para evitar desfases de zona horaria. */
function analizarFecha(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (coincidencia) {
    const [, anio, mes, dia] = coincidencia;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Combina fecha y hora de la cita para clasificar eventos pasados y próximos. */
function marcaTemporal(cita) {
  const fecha = obtenerFechaCita(cita);
  if (!fecha) return Number.POSITIVE_INFINITY;
  const hora = obtenerHoraCita(cita) || "00:00:00";
  const partes = hora.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const fechaLocal = analizarFecha(fecha);
  if (!fechaLocal) return Number.POSITIVE_INFINITY;
  if (partes) fechaLocal.setHours(Number(partes[1]), Number(partes[2]), Number(partes[3] || 0), 0);
  return fechaLocal.getTime();
}

/** Obtiene el campo DATE de CITAS o el alias de presentación que entrega el servidor. */
function obtenerFechaCita(cita) {
  return cita?.fecha_cita || cita?.fecha || cita?.fecha_evento || null;
}

/** Obtiene el campo TIME de CITAS o el alias de presentación del endpoint. */
function obtenerHoraCita(cita) {
  return cita?.hora_cita || cita?.hora || cita?.hora_evento || null;
}

/** Devuelve la fecha de hoy a medianoche para clasificar una cita sin depender de su hora actual. */
function inicioDeHoy() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy.getTime();
}

/** Devuelve el primer día del mes señalado por YYYY-MM. */
function fechaDesdeMes(mes) {
  const coincidencia = String(mes).match(/^(\d{4})-(\d{2})$/);
  if (!coincidencia) return new Date();
  return new Date(Number(coincidencia[1]), Number(coincidencia[2]) - 1, 1);
}

/** Comprueba si la cita coincide con el texto de búsqueda del encabezado compartido. */
function coincideBusqueda(cita) {
  const termino = estado.busqueda.trim().toLocaleLowerCase("es-CO");
  if (!termino) return true;
  const textos = [
    obtenerNombreMascota(cita), obtenerMotivo(cita), obtenerVeterinaria(cita), obtenerEstado(cita).etiqueta,
    obtenerFechaCita(cita), obtenerHoraCita(cita)
  ];
  return textos.some((valor) => textoSeguro(valor).toLocaleLowerCase("es-CO").includes(termino));
}

/** Obtiene el nombre de la mascota desde un alias o una relación anidada. */
function obtenerNombreMascota(cita) {
  const mascota = estado.mascotas.find((item) => String(item.id) === String(cita?.mascota_id));
  return cita?.nombre_mascota || cita?.mascota_nombre || cita?.mascota?.nombre || mascota?.nombre || "Mascota";
}

/** Obtiene el motivo desde el alias del endpoint o la relación de catálogo. */
function obtenerMotivo(cita) {
  return cita?.nombre_motivo || cita?.motivo_nombre || cita?.motivo_consulta || cita?.motivo?.nombre || "Motivo no especificado";
}

/** Obtiene el nombre de la veterinaria desde el alias del endpoint o la relación. */
function obtenerVeterinaria(cita) {
  return cita?.nombre_veterinaria || cita?.veterinaria_nombre || cita?.veterinaria?.nombre || "Veterinaria no especificada";
}

/** Convierte el estado enum de CITAS en una pastilla comprensible. */
function obtenerEstado(cita) {
  const clave = textoSeguro(cita?.estado).toLowerCase();
  return ESTADOS[clave] || { etiqueta: "Estado no disponible", clase: "pastilla--estado-desconocido" };
}

/** Valida enlaces de fotos externas por seguridad; la tarjeta puede funcionar sin imagen. */
function urlSegura(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor, window.location.origin);
    if (url.protocol === "https:" || url.origin === window.location.origin) return url.href;
    return null;
  } catch {
    return null;
  }
}

/** Presenta el estado de carga de una región sin crear contenido ficticio. */
function renderizarCarga(contenedor, mensaje) {
  const bloque = crearElemento("div", { clase: "citas-carga", atributos: { role: "status" } });
  bloque.append(crearElemento("span", { clase: "cargando", atributos: { "aria-hidden": "true" } }));
  bloque.append(crearElemento("p", { texto: mensaje }));
  contenedor.replaceChildren(bloque);
}

/** Presenta el estado vacío solicitado por el módulo y una explicación útil. */
function renderizarVacio(contenedor, descripcion = "Cuando se programe una cita para tus mascotas, aparecerá aquí") {
  const bloque = crearElemento("section", { clase: "citas-vacio", atributos: { "aria-live": "polite" } });
  const icono = crearElemento("span", { clase: "citas-vacio__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("calendario"));
  bloque.append(
    icono,
    crearElemento("h3", { texto: "Aún no tienes citas" }),
    crearElemento("p", { texto: descripcion })
  );
  contenedor.replaceChildren(bloque);
}

/** Explica un error de red/API y ofrece volver a consultar la sección afectada. */
function renderizarError(contenedor, error, reintentar) {
  const bloque = crearElemento("div", { clase: "citas-error", atributos: { role: "alert" } });
  const icono = crearElemento("span", { clase: "citas-vacio__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("alerta"));
  const mensaje = error instanceof ApiError
    ? error.error || error.message
    : error?.message || "No fue posible cargar las citas. Comprueba tu conexión e inténtalo nuevamente.";
  bloque.append(icono, crearElemento("p", { clase: "citas-error__mensaje", texto: mensaje }));
  const boton = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
  boton.addEventListener("click", reintentar);
  bloque.append(boton);
  contenedor.replaceChildren(bloque);
}

/** Crea un par icono/valor para los datos de cada cita. */
function crearDato(iconoNombre, texto) {
  const dato = crearElemento("div", { clase: "cita-tarjeta__dato" });
  dato.append(crearIcono(iconoNombre), crearElemento("span", { texto }));
  return dato;
}

/** Crea una tarjeta de consulta con mascota, motivo, veterinaria, fecha, hora y estado. */
function crearTarjetaCita(cita) {
  const tarjeta = crearElemento("article", { clase: "cita-tarjeta" });
  const principal = crearElemento("div", { clase: "cita-tarjeta__principal" });
  const icono = crearElemento("span", { clase: "cita-tarjeta__icono", atributos: { "aria-hidden": "true" } });
  const foto = urlSegura(cita?.foto_mascota || cita?.mascota?.foto_url || estado.mascotas.find((item) => String(item.id) === String(cita?.mascota_id))?.foto_url);
  if (foto) {
    const imagen = crearElemento("img", { atributos: { src: foto, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => icono.replaceChildren(crearIcono("huella")), { once: true });
    icono.append(imagen);
  } else {
    icono.append(crearIcono("huella"));
  }

  const encabezado = crearElemento("div", { clase: "cita-tarjeta__encabezado" });
  encabezado.append(
    crearElemento("h4", { clase: "cita-tarjeta__mascota", texto: obtenerNombreMascota(cita) }),
    crearElemento("p", { clase: "cita-tarjeta__motivo", texto: obtenerMotivo(cita) })
  );

  const estadoCita = obtenerEstado(cita);
  const pastilla = crearElemento("span", { clase: `pastilla ${estadoCita.clase} cita-tarjeta__estado`, texto: estadoCita.etiqueta });
  principal.append(icono, encabezado, pastilla);

  const datos = crearElemento("div", { clase: "cita-tarjeta__datos" });
  const fecha = obtenerFechaCita(cita);
  const hora = obtenerHoraCita(cita);
  datos.append(
    crearDato("veterinaria", obtenerVeterinaria(cita)),
    crearDato("calendario", fecha ? formatearFecha(fecha) : "Fecha no disponible"),
    crearDato("reloj", hora ? formatearHora(hora) : "Hora no disponible")
  );
  tarjeta.append(principal, datos);
  return tarjeta;
}

/** Obtiene los registros de citas y divide las próximas de las pasadas según fecha/hora local. */
function renderizarLista(contenedor) {
  const citasFiltradas = estado.citasLista.filter(coincideBusqueda);
  const sinBusqueda = estado.busqueda.trim() === "";
  if (!estado.citasLista.length) {
    renderizarVacio(contenedor);
    return;
  }
  if (!citasFiltradas.length) {
    renderizarVacio(contenedor, "No encontramos citas que coincidan con tu búsqueda.");
    return;
  }

  const ahora = Date.now();
  const proximas = citasFiltradas.filter((cita) => marcaTemporal(cita) >= ahora).sort((a, b) => marcaTemporal(a) - marcaTemporal(b));
  const pasadas = citasFiltradas.filter((cita) => marcaTemporal(cita) < ahora).sort((a, b) => marcaTemporal(b) - marcaTemporal(a));
  const secciones = crearElemento("div", { clase: "citas-secciones" });

  secciones.append(crearGrupoLista("Próximas citas", proximas, "No tienes citas próximas."));
  secciones.append(crearGrupoLista("Citas pasadas", pasadas, "Todavía no hay citas pasadas."));
  if (!sinBusqueda) {
    secciones.setAttribute("aria-label", "Resultados de búsqueda de citas");
  }
  contenedor.replaceChildren(secciones);
}

/** Dibuja una de las secciones próximas/pasadas y conserva el orden recibido por renderizarLista. */
function crearGrupoLista(titulo, citas, mensajeVacio) {
  const grupo = crearElemento("section", { clase: "citas-grupo", atributos: { "aria-label": titulo } });
  const encabezado = crearElemento("div", { clase: "citas-grupo__encabezado" });
  encabezado.append(
    crearElemento("h3", { texto: titulo }),
    crearElemento("span", { clase: "citas-grupo__cantidad", texto: String(citas.length), atributos: { "aria-label": `${citas.length} citas` } })
  );
  const lista = crearElemento("div", { clase: "citas-grupo__lista" });
  if (citas.length) {
    const fragmento = document.createDocumentFragment();
    for (const cita of citas) fragmento.append(crearTarjetaCita(cita));
    lista.append(fragmento);
  } else {
    lista.append(crearElemento("p", { clase: "citas-subestado", texto: mensajeVacio }));
  }
  grupo.append(encabezado, lista);
  return grupo;
}

/** Crea el encabezado de la vista mensual con navegación accesible entre meses. */
function crearEncabezadoCalendario() {
  const encabezado = crearElemento("div", { clase: "citas-calendario__encabezado" });
  const fecha = fechaDesdeMes(estado.mes);
  const titulo = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(fecha);
  encabezado.append(crearElemento("h3", { clase: "citas-calendario__titulo", texto: titulo }));

  const navegacion = crearElemento("div", { clase: "citas-calendario__navegacion" });
  const anterior = crearElemento("button", { clase: "citas-calendario__flecha", texto: "‹", atributos: { type: "button", "aria-label": "Mes anterior" } });
  anterior.addEventListener("click", () => cambiarMes(-1));
  const siguiente = crearElemento("button", { clase: "citas-calendario__flecha", texto: "›", atributos: { type: "button", "aria-label": "Mes siguiente" } });
  siguiente.addEventListener("click", () => cambiarMes(1));
  navegacion.append(anterior, siguiente);
  encabezado.append(navegacion);
  return encabezado;
}

/** Construye el calendario mensual. Los días con citas reciben un indicador visual y accesible. */
function crearRejillaCalendario(citas) {
  const rejilla = crearElemento("div", { clase: "citas-calendario__rejilla", atributos: { role: "grid", "aria-label": "Calendario mensual de citas" } });
  const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  for (const dia of diasSemana) {
    rejilla.append(crearElemento("span", { clase: "citas-calendario__dia-semana", texto: dia, atributos: { role: "columnheader" } }));
  }

  const primerDia = fechaDesdeMes(estado.mes);
  const anio = primerDia.getFullYear();
  const mes = primerDia.getMonth();
  const desplazamiento = (primerDia.getDay() + 6) % 7;
  const cantidadDias = new Date(anio, mes + 1, 0).getDate();
  const cantidadCeldas = Math.ceil((desplazamiento + cantidadDias) / 7) * 7;
  const citasPorDia = new Map();
  for (const cita of citas) {
    const fecha = obtenerFechaCita(cita);
    if (!fecha) continue;
    citasPorDia.set(fecha, (citasPorDia.get(fecha) || 0) + 1);
  }

  const hoy = fechaISO(new Date());
  for (let indice = 0; indice < cantidadCeldas; indice += 1) {
    const numeroDia = indice - desplazamiento + 1;
    const celda = crearElemento("div", { clase: "citas-calendario__celda", atributos: { role: "gridcell" } });
    if (numeroDia >= 1 && numeroDia <= cantidadDias) {
      const fecha = `${estado.mes}-${String(numeroDia).padStart(2, "0")}`;
      const cantidadCitas = citasPorDia.get(fecha) || 0;
      const clases = ["citas-calendario__dia"];
      if (fecha === hoy) clases.push("citas-calendario__dia--hoy");
      if (cantidadCitas) clases.push("citas-calendario__dia--con-citas");
      if (fecha === estado.fechaSeleccionada) clases.push("citas-calendario__dia--seleccionado");

      const boton = crearElemento("button", {
        clase: clases.join(" "),
        texto: String(numeroDia),
        atributos: {
          type: "button",
          "aria-pressed": String(fecha === estado.fechaSeleccionada),
          "aria-label": `${numeroDia} de ${tituloMes(estado.mes)}${cantidadCitas ? `, ${cantidadCitas} ${cantidadCitas === 1 ? "cita" : "citas"}` : ", sin citas"}`
        }
      });
      boton.addEventListener("click", () => seleccionarDia(fecha));
      celda.append(boton);
    }
    rejilla.append(celda);
  }
  return rejilla;
}

/** Devuelve el nombre del mes para el texto accesible del calendario. */
function tituloMes(mes) {
  return new Intl.DateTimeFormat("es-CO", { month: "long" }).format(fechaDesdeMes(mes));
}

/** Dibuja las citas que pertenecen al día seleccionado del mes consultado. */
function renderizarCitasDelDia(contenedor) {
  const citasDelDia = estado.citasMes
    .filter((cita) => obtenerFechaCita(cita) === estado.fechaSeleccionada && coincideBusqueda(cita))
    .sort((a, b) => marcaTemporal(a) - marcaTemporal(b));
  const bloque = crearElemento("section", { clase: "citas-calendario__seleccionado", atributos: { "aria-live": "polite" } });
  const fecha = analizarFecha(estado.fechaSeleccionada);
  bloque.append(crearElemento("h3", { texto: fecha ? new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(fecha) : "Citas del día" }));

  if (citasDelDia.length) {
    const lista = crearElemento("div", { clase: "citas-grupo__lista" });
    for (const cita of citasDelDia) lista.append(crearTarjetaCita(cita));
    bloque.append(lista);
  } else {
    bloque.append(crearElemento("p", {
      clase: "citas-subestado",
      texto: estado.citasMes.length
        ? "No hay citas programadas para este día."
        : estado.listaCargada && estado.listaFiltro === estado.mascotaId && estado.citasLista.length === 0
          ? "Cuando se programe una cita para tus mascotas, aparecerá aquí"
          : "No hay citas en este mes. Prueba con otro mes o ajusta el filtro."
    }));
  }
  contenedor.replaceChildren(bloque);
}

/** Renderiza la vista calendario una vez que el endpoint del mes respondió. */
function renderizarCalendario(contenedor) {
  const estructura = crearElemento("div", { clase: "citas-calendario" });
  const tarjeta = crearElemento("section", { clase: "citas-calendario__tarjeta", atributos: { "aria-label": "Calendario del mes" } });
  tarjeta.append(crearEncabezadoCalendario(), crearRejillaCalendario(estado.citasMes));
  const dia = crearElemento("div", { clase: "citas-calendario__seleccionado-contenedor" });
  renderizarCitasDelDia(dia);
  estructura.append(tarjeta, dia);
  contenedor.replaceChildren(estructura);
}

/** Selecciona un día, vuelve a dibujar el calendario y muestra sus citas sin otra petición. */
function seleccionarDia(fecha) {
  estado.fechaSeleccionada = fecha;
  if (estado.regiones) renderizarCalendario(estado.regiones.calendario);
}

/** Cambia el mes y obtiene las citas del nuevo periodo desde GET /api/citas. */
function cambiarMes(desplazamiento) {
  const actual = fechaDesdeMes(estado.mes);
  actual.setMonth(actual.getMonth() + desplazamiento, 1);
  estado.mes = mesActualISO(actual);
  const primerDiaMes = `${estado.mes}-01`;
  estado.fechaSeleccionada = primerDiaMes;
  cargarCalendario();
}

/** Sincroniza las pestañas Lista/Mes con las regiones visibles y su selección accesible. */
function cambiarVista(vista) {
  if (vista !== "lista" && vista !== "mes") return;
  estado.vista = vista;
  const esLista = vista === "lista";
  estado.regiones.botonLista.setAttribute("aria-selected", String(esLista));
  estado.regiones.botonMes.setAttribute("aria-selected", String(!esLista));
  estado.regiones.lista.hidden = !esLista;
  estado.regiones.calendario.hidden = esLista;

  if (esLista) {
    if (!estado.listaCargada || estado.listaFiltro !== estado.mascotaId) cargarLista();
    else renderizarLista(estado.regiones.lista);
  } else if (!estado.calendarioCargado || estado.calendarioMes !== `${estado.mes}|${estado.mascotaId}`) {
    cargarCalendario();
  } else {
    renderizarCalendario(estado.regiones.calendario);
  }
}

/** Carga todas las citas del usuario y opcionalmente filtra por mascota. */
async function cargarLista() {
  const contenedor = estado.regiones.lista;
  const numeroSolicitud = ++estado.secuenciaLista;
  const mascotaSolicitada = estado.mascotaId;
  renderizarCarga(contenedor, "Consultando tus próximas y pasadas citas…");
  try {
    const respuesta = await api.citas.listar({ mascota_id: mascotaSolicitada || undefined });
    if (numeroSolicitud !== estado.secuenciaLista) return;
    estado.citasLista = obtenerColeccion(respuesta);
    estado.listaCargada = true;
    estado.listaFiltro = mascotaSolicitada;
    renderizarLista(contenedor);
    if (estado.vista === "mes" && estado.calendarioCargado) renderizarCalendario(estado.regiones.calendario);
  } catch (error) {
    if (numeroSolicitud !== estado.secuenciaLista) return;
    renderizarError(contenedor, error, cargarLista);
  }
}

/** Carga las citas del mes actual con los parámetros mes y mascota_id solicitados. */
async function cargarCalendario() {
  const contenedor = estado.regiones.calendario;
  const numeroSolicitud = ++estado.secuenciaCalendario;
  const mesSolicitado = estado.mes;
  const mascotaSolicitada = estado.mascotaId;
  renderizarCarga(contenedor, "Cargando el calendario…");
  try {
    const respuesta = await api.citas.listarMes(mesSolicitado, mascotaSolicitada || undefined);
    if (numeroSolicitud !== estado.secuenciaCalendario) return;
    estado.citasMes = obtenerColeccion(respuesta);
    estado.calendarioCargado = true;
    estado.calendarioMes = `${mesSolicitado}|${mascotaSolicitada}`;

    const mesSeleccionado = estado.fechaSeleccionada.slice(0, 7);
    if (mesSeleccionado !== mesSolicitado) {
      estado.fechaSeleccionada = estado.citasMes.length && obtenerFechaCita(estado.citasMes[0])
        ? obtenerFechaCita(estado.citasMes[0])
        : `${mesSolicitado}-01`;
    }
    renderizarCalendario(contenedor);
  } catch (error) {
    if (numeroSolicitud !== estado.secuenciaCalendario) return;
    renderizarError(contenedor, error, cargarCalendario);
  }
}

/** Obtiene el catálogo de mascotas para poblar el filtro sin inventar opciones. */
async function cargarMascotasFiltro(select, mensaje) {
  try {
    const respuesta = await api.mascotas.listar({ activa: true });
    estado.mascotas = obtenerColeccion(respuesta, ["datos", "mascotas"]);
    const fragmento = document.createDocumentFragment();
    fragmento.append(crearElemento("option", { texto: "Todas las mascotas", atributos: { value: "" } }));
    for (const mascota of estado.mascotas) {
      if (mascota?.id === undefined || mascota?.id === null) continue;
      fragmento.append(crearElemento("option", {
        texto: mascota.nombre || `Mascota ${mascota.id}`,
        atributos: { value: mascota.id }
      }));
    }
    select.replaceChildren(fragmento);
    select.disabled = false;
    mensaje.hidden = true;
  } catch (error) {
    select.disabled = true;
    mensaje.textContent = error instanceof ApiError
      ? error.error || error.message
      : "No se pudo cargar la lista de mascotas. Puedes consultar todas las citas.";
    mensaje.hidden = false;
  }
}

/** Actualiza el filtro y vuelve a consultar la vista seleccionada. */
function cambiarMascotaFiltro(valor) {
  estado.mascotaId = valor;
  estado.listaCargada = false;
  estado.calendarioCargado = false;
  if (estado.vista === "lista") cargarLista();
  else {
    cargarLista();
    cargarCalendario();
  }
}

/** Crea los controles superiores de la página sin incluir acciones para agendar citas. */
function crearControles() {
  const controles = crearElemento("section", { clase: "citas-controles", atributos: { "aria-label": "Opciones de visualización" } });
  const pestañas = crearElemento("div", { clase: "citas-vistas", atributos: { role: "tablist", "aria-label": "Vista de citas" } });
  const botonLista = crearElemento("button", {
    clase: "citas-vistas__boton",
    atributos: { type: "button", role: "tab", id: "citas-tab-lista", "aria-selected": "true", "aria-controls": "citas-panel-lista" }
  });
  botonLista.append(crearIcono("lista"), document.createTextNode("Lista"));
  botonLista.addEventListener("click", () => cambiarVista("lista"));
  const botonMes = crearElemento("button", {
    clase: "citas-vistas__boton",
    atributos: { type: "button", role: "tab", id: "citas-tab-mes", "aria-selected": "false", "aria-controls": "citas-panel-mes" }
  });
  botonMes.append(crearIcono("calendario"), document.createTextNode("Mes"));
  botonMes.addEventListener("click", () => cambiarVista("mes"));
  pestañas.append(botonLista, botonMes);

  const filtro = crearElemento("div", { clase: "citas-filtro" });
  const etiqueta = crearElemento("label", { texto: "Filtrar por mascota", atributos: { for: "filtro-mascota-citas" } });
  const select = crearElemento("select", { atributos: { id: "filtro-mascota-citas", name: "mascota_id", disabled: "" } });
  select.append(crearElemento("option", { texto: "Cargando mascotas…", atributos: { value: "" } }));
  select.addEventListener("change", () => cambiarMascotaFiltro(select.value));
  const mensaje = crearElemento("small", { clase: "citas-filtro__ayuda", atributos: { id: "filtro-mascota-mensaje", role: "status", hidden: "" } });
  filtro.append(etiqueta, select, mensaje);
  controles.append(pestañas, filtro);
  return { controles, botonLista, botonMes, select, mensaje };
}

/** Construye el contenido de Citas que se inserta dentro del layout compartido. */
function construirPagina(contenedor) {
  const pagina = crearElemento("div", { clase: "citas-pagina" });
  const intro = crearElemento("header", { clase: "citas-intro" });
  const sobrelinea = crearElemento("p", { clase: "citas-intro__sobrelinea" });
  sobrelinea.append(crearIcono("calendario"), document.createTextNode("Agenda de tus mascotas"));
  intro.append(
    sobrelinea,
    crearElemento("h2", { texto: "Citas", atributos: { id: "citas-titulo" } }),
    crearElemento("p", { texto: "Consulta las visitas veterinarias de tus mascotas" })
  );

  const controles = crearControles();
  const lista = crearElemento("section", { clase: "citas-vista", atributos: { id: "citas-panel-lista", role: "tabpanel", "aria-labelledby": "citas-tab-lista" } });
  const calendario = crearElemento("section", { clase: "citas-vista", atributos: { id: "citas-panel-mes", role: "tabpanel", "aria-labelledby": "citas-tab-mes", hidden: "" } });
  renderizarCarga(lista, "Consultando tus citas…");

  pagina.append(intro, controles.controles, lista, calendario);
  contenedor.replaceChildren(pagina);
  return {
    lista,
    calendario,
    botonLista: controles.botonLista,
    botonMes: controles.botonMes,
    filtro: controles.select,
    mensajeFiltro: controles.mensaje
  };
}

/** Muestra un error de sesión recuperable cuando no se puede validar al usuario. */
function mostrarErrorSesion(contenedor, error) {
  contenedor.setAttribute("aria-busy", "false");
  const tarjeta = crearElemento("section", { clase: "citas-sesion-error__tarjeta" });
  tarjeta.append(
    crearElemento("h1", { texto: "No pudimos conectar con PetCare" }),
    crearElemento("p", { texto: error instanceof ApiError ? error.error || error.message : error?.message || "Ocurrió un error al validar tu sesión." })
  );
  const reintentar = crearElemento("button", { clase: "boton", texto: "Volver a intentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", iniciar);
  const login = crearElemento("a", { clase: "boton boton--secundario", texto: "Ir al inicio de sesión", atributos: { href: RUTAS.login } });
  const acciones = crearElemento("div", { clase: "pagina-error__acciones" });
  acciones.append(reintentar, login);
  tarjeta.append(acciones);
  const region = crearElemento("main", { clase: "citas-sesion-error", atributos: { role: "alert" } });
  region.append(tarjeta);
  contenedor.replaceChildren(region);
}

/** Valida sesión, restringe el acceso al rol usuario y carga los datos de la vista inicial. */
async function iniciar() {
  const raiz = document.querySelector("#app");
  if (!raiz) return;
  raiz.setAttribute("aria-busy", "true");

  try {
    estado.sesion = await protegerPagina({
      roles: ["usuario"],
      loginUrl: RUTAS.login,
      inicioUrl: RUTAS.admin
    });
  } catch (error) {
    mostrarErrorSesion(raiz, error);
    return;
  }
  if (!estado.sesion) return;

  try {
    const layout = montarLayout({
      contenedor: raiz,
      sesion: estado.sesion,
      titulo: "Citas",
      paginaActual: "/citas.html",
      onBuscar: (termino) => {
        estado.busqueda = termino;
        if (estado.vista === "lista" && estado.listaCargada) renderizarLista(estado.regiones.lista);
        if (estado.vista === "mes" && estado.calendarioCargado) renderizarCalendario(estado.regiones.calendario);
      },
      contadorNotificaciones: estado.sesion.notificaciones_sin_leer
    });
    estado.regiones = construirPagina(layout.contenido);
    raiz.setAttribute("aria-busy", "false");
    await cargarMascotasFiltro(estado.regiones.filtro, estado.regiones.mensajeFiltro);
    await cargarLista();
  } catch (error) {
    mostrarErrorSesion(raiz, error);
  }
}

iniciar();
