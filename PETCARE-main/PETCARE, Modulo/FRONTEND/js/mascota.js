/** Lógica del perfil individual: peso, citas, recordatorios e historial de vacunaciones. */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { calcularEdad, formatearFecha, formatearFechaHora, formatearHora, textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", administrador: "/admin-usuarios.html", mascotas: "/mascotas.html" };
const ICONOS = {
  huella: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  calendario: ["M8 3v4", "M16 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
  vacuna: ["M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", "m9 12 2 2 4-4"],
  peso: ["M3 3v18h18", "m7 14 4-4 4 3 6-7"],
  reloj: ["M12 8v4l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  flecha: ["M5 12h14", "m12 5 7 7-7 7"]
};

let mascotaActual = null;
let enviandoPeso = false;
let enviandoRecordatorio = false;

/** Crea nodos con texto plano y atributos seguros, sin insertar contenido remoto como HTML. */
function crearElemento(etiqueta, { clase, texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Dibuja trazos SVG estáticos del módulo para ilustrar estados y secciones. */
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

/** Normaliza el contenedor de listas que devuelve cada recurso REST. */
function obtenerLista(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  return Array.isArray(respuesta?.datos) ? respuesta.datos : [];
}

/** Acepta imágenes HTTPS o rutas del mismo origen para impedir protocolos activos. */
function obtenerFotoSegura(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor, window.location.origin);
    return url.protocol === "https:" || url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Traduce el estado de salud almacenado en MASCOTAS sin atribuirle valores desconocidos. */
function datosEstadoSalud(valor) {
  const estados = {
    excelente: { texto: "Excelente", clase: "pastilla--al-dia" },
    bueno: { texto: "Bueno", clase: "pastilla--confirmada" },
    requiere_atencion: { texto: "Requiere atención", clase: "pastilla--proxima" }
  };
  return estados[valor] || { texto: "Estado no registrado", clase: "" };
}

/** Formatea la edad sin calcularla cuando no existe fecha_nacimiento. */
function obtenerEdad(mascota) {
  return calcularEdad(mascota.fecha_nacimiento) || "No registrada";
}

/** Resuelve el peso más reciente desde el resumen o desde la medición cargada. */
function obtenerPesoActual(mascota, pesos) {
  if (mascota.peso_actual_kg !== undefined && mascota.peso_actual_kg !== null && mascota.peso_actual_kg !== "") return mascota.peso_actual_kg;
  const ordenados = [...pesos].sort((a, b) => textoSeguro(b.medido_en).localeCompare(textoSeguro(a.medido_en)));
  return ordenados[0]?.peso_kg ?? null;
}

/** Interpreta los valores booleanos que MySQL puede serializar como 0, 1, "0" o "1". */
function estaCompletado(valor) {
  return valor === true || valor === 1 || valor === "1";
}

/** Devuelve un texto de peso sin asumir unidades ni ceros para datos inexistentes. */
function formatearPeso(valor) {
  if (valor === null || valor === undefined || valor === "") return "No registrado";
  const numero = Number(valor);
  return Number.isFinite(numero) ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(numero)} kg` : "No registrado";
}

/** Crea un bloque de dato general con etiqueta y valor accesible. */
function crearDatoGeneral(etiqueta, valor) {
  const dato = crearElemento("div", { clase: "perfil-general__dato" });
  dato.append(crearElemento("dt", { texto: etiqueta }), crearElemento("dd", { texto: valor || "No registrado" }));
  return dato;
}

/** Construye el encabezado principal del perfil a partir de los datos reales de MASCOTAS. */
function renderizarHero(contenedor, mascota, pesos) {
  contenedor.replaceChildren();
  const hero = crearElemento("header", { clase: "perfil-mascota__hero" });
  const identidad = crearElemento("div", { clase: "perfil-mascota__identidad" });
  const foto = crearElemento("div", { clase: "perfil-mascota__foto" });
  const rutaFoto = obtenerFotoSegura(mascota.foto_url);
  if (rutaFoto) {
    const imagen = crearElemento("img", { atributos: { src: rutaFoto, alt: `Fotografía de ${mascota.nombre || "la mascota"}`, referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => { imagen.remove(); foto.append(crearIcono("huella")); }, { once: true });
    foto.append(imagen);
  } else {
    foto.append(crearIcono("huella"));
  }
  const texto = crearElemento("div");
  const estado = datosEstadoSalud(mascota.estado_salud);
  texto.append(
    crearElemento("h1", { clase: "perfil-mascota__nombre", texto: mascota.nombre || "Mascota" }),
    crearElemento("p", { clase: "perfil-mascota__meta", texto: [mascota.nombre_especie, mascota.nombre_raza].filter(Boolean).join(" · ") || "Especie o raza no registrada" })
  );
  const resumen = crearElemento("div", { clase: "perfil-mascota__resumen" });
  resumen.append(
    crearElemento("span", { clase: `pastilla ${estado.clase}`.trim(), texto: estado.texto }),
    crearElemento("span", { clase: "pastilla", texto: obtenerEdad(mascota) }),
    crearElemento("span", { clase: "pastilla", texto: formatearPeso(obtenerPesoActual(mascota, pesos)) })
  );
  texto.append(resumen);
  identidad.append(foto, texto);

  const acciones = crearElemento("div", { clase: "perfil-mascota__acciones" });
  const editar = crearElemento("a", { clase: "boton", texto: "Editar perfil", atributos: { href: `${RUTAS.mascotas}?editar=${encodeURIComponent(String(mascota.id))}` } });
  editar.append(crearIcono("flecha"));
  acciones.append(editar);
  hero.append(identidad, acciones);
  contenedor.append(hero);
}

/** Construye la estructura fija del perfil y devuelve los contenedores de carga independientes. */
function construirPerfil(contenedor) {
  const raiz = crearElemento("div", { clase: "perfil-mascota" });
  const volver = crearElemento("a", { clase: "perfil-mascota__volver", texto: "Volver a Mis mascotas", atributos: { href: RUTAS.mascotas } });
  volver.prepend(crearIcono("flecha"));
  const hero = crearElemento("div", { atributos: { id: "perfil-hero" } });
  const rejilla = crearElemento("div", { clase: "perfil-mascota__rejilla" });

  const general = crearElemento("section", { clase: "perfil-panel", atributos: { "aria-labelledby": "perfil-general-titulo" } });
  const generalHeader = crearElemento("div", { clase: "perfil-panel__encabezado" });
  generalHeader.append(crearElemento("h2", { texto: "Información general", atributos: { id: "perfil-general-titulo" } }));
  const datosGeneral = crearElemento("dl", { clase: "perfil-general__datos", atributos: { id: "perfil-general-datos" } });
  general.append(generalHeader, datosGeneral);

  const pesoPanel = crearElemento("section", { clase: "perfil-panel", atributos: { "aria-labelledby": "perfil-peso-titulo" } });
  const pesoHeader = crearElemento("div", { clase: "perfil-panel__encabezado" });
  const pesoTextos = crearElemento("div");
  pesoTextos.append(crearElemento("h2", { texto: "Evolución del peso", atributos: { id: "perfil-peso-titulo" } }), crearElemento("p", { texto: "Consulta las mediciones registradas de tu mascota." }));
  const botonPeso = crearElemento("button", { clase: "boton boton--secundario", texto: "+ Registrar peso", atributos: { type: "button", id: "abrir-modal-peso" } });
  botonPeso.addEventListener("click", () => abrirModal("modal-peso"));
  pesoHeader.append(pesoTextos, botonPeso);
  const grafica = crearElemento("div", { clase: "perfil-grafica", atributos: { id: "perfil-grafica", role: "region", "aria-label": "Gráfica de evolución del peso" } });
  pesoPanel.append(pesoHeader, grafica);

  const citasPanel = crearElemento("section", { clase: "perfil-panel", atributos: { "aria-labelledby": "perfil-citas-titulo" } });
  const citasHeader = crearElemento("div", { clase: "perfil-panel__encabezado" });
  citasHeader.append(crearElemento("h2", { texto: "Próximas citas", atributos: { id: "perfil-citas-titulo" } }));
  const citasLista = crearElemento("div", { clase: "perfil-lista", atributos: { id: "perfil-citas", "aria-live": "polite" } });
  citasPanel.append(citasHeader, citasLista);

  const recordatoriosPanel = crearElemento("section", { clase: "perfil-panel", atributos: { "aria-labelledby": "perfil-recordatorios-titulo" } });
  const recordatoriosHeader = crearElemento("div", { clase: "perfil-panel__encabezado" });
  const recordatoriosTitulo = crearElemento("div");
  recordatoriosTitulo.append(crearElemento("h2", { texto: "Recordatorios", atributos: { id: "perfil-recordatorios-titulo" } }), crearElemento("p", { texto: "Organiza las próximas tareas de cuidado." }));
  const botonRecordatorio = crearElemento("button", { clase: "boton boton--secundario", texto: "+ Crear", atributos: { type: "button" } });
  botonRecordatorio.addEventListener("click", () => abrirModal("modal-recordatorio"));
  recordatoriosHeader.append(recordatoriosTitulo, botonRecordatorio);
  const recordatoriosLista = crearElemento("div", { clase: "perfil-lista", atributos: { id: "perfil-recordatorios", "aria-live": "polite" } });
  recordatoriosPanel.append(recordatoriosHeader, recordatoriosLista);

  const vacunasPanel = crearElemento("section", { clase: "perfil-panel perfil-panel--ancho", atributos: { "aria-labelledby": "perfil-vacunas-titulo" } });
  const vacunasHeader = crearElemento("div", { clase: "perfil-panel__encabezado" });
  vacunasHeader.append(crearElemento("h2", { texto: "Historial de vacunas", atributos: { id: "perfil-vacunas-titulo" } }));
  const vacunasLista = crearElemento("div", { clase: "perfil-lista", atributos: { id: "perfil-vacunas", "aria-live": "polite" } });
  vacunasPanel.append(vacunasHeader, vacunasLista);

  rejilla.append(general, pesoPanel, citasPanel, recordatoriosPanel, vacunasPanel);
  raiz.append(volver, hero, rejilla);
  contenedor.replaceChildren(raiz);
  return { hero, datosGeneral, grafica, citasLista, recordatoriosLista, vacunasLista };
}

/** Completa la sección de información general sin depender de alias opcionales de vistas. */
function renderizarInformacionGeneral(contenedor, mascota, pesos) {
  const peso = obtenerPesoActual(mascota, pesos);
  const datos = [
    ["Especie", mascota.nombre_especie],
    ["Raza", mascota.nombre_raza],
    ["Edad", obtenerEdad(mascota)],
    ["Peso actual", formatearPeso(peso)],
    ["Sexo", mascota.sexo === "macho" ? "Macho" : mascota.sexo === "hembra" ? "Hembra" : null],
    ["Color", mascota.color]
  ];
  const fragmento = document.createDocumentFragment();
  for (const [etiqueta, valor] of datos) fragmento.append(crearDatoGeneral(etiqueta, valor));
  contenedor.replaceChildren(fragmento);
}

/** Muestra un estado vacío reutilizable cuando no existen mediciones o eventos. */
function renderizarVacio(contenedor, mensaje) {
  contenedor.replaceChildren(crearElemento("p", { clase: "perfil-lista__vacio", texto: mensaje }));
}

/** Dibuja la gráfica de línea en SVG con coordenadas derivadas exclusivamente del historial real. */
function renderizarGrafica(contenedor, pesos) {
  contenedor.replaceChildren();
  const ordenados = [...pesos].filter((item) => Number.isFinite(Number(item.peso_kg)) && item.medido_en)
    .sort((a, b) => textoSeguro(a.medido_en).localeCompare(textoSeguro(b.medido_en)));
  if (!ordenados.length) {
    renderizarVacio(contenedor, "Todavía no hay mediciones de peso registradas. Registra la primera para comenzar el seguimiento.");
    return;
  }

  const espacio = { izquierda: 52, derecha: 672, arriba: 24, abajo: 218 };
  const anchura = espacio.derecha - espacio.izquierda;
  const altura = espacio.abajo - espacio.arriba;
  const valores = ordenados.map((item) => Number(item.peso_kg));
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const margen = Math.max((maximo - minimo) * 0.2, Math.max(maximo * 0.08, 0.2));
  const limiteInferior = Math.max(0, minimo - margen);
  const limiteSuperior = maximo + margen;
  const rango = limiteSuperior - limiteInferior || 1;
  const puntos = ordenados.map((item, indice) => ({
    x: ordenados.length === 1 ? espacio.izquierda + anchura / 2 : espacio.izquierda + (indice / (ordenados.length - 1)) * anchura,
    y: espacio.abajo - ((Number(item.peso_kg) - limiteInferior) / rango) * altura,
    valor: Number(item.peso_kg),
    fecha: item.medido_en
  }));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 710 270");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Evolución del peso con ${ordenados.length} mediciones registradas`);

  for (let linea = 0; linea < 4; linea += 1) {
    const y = espacio.arriba + (altura / 3) * linea;
    const trazo = document.createElementNS("http://www.w3.org/2000/svg", "line");
    trazo.setAttribute("x1", String(espacio.izquierda));
    trazo.setAttribute("x2", String(espacio.derecha));
    trazo.setAttribute("y1", String(y));
    trazo.setAttribute("y2", String(y));
    trazo.setAttribute("class", "perfil-grafica__rejilla");
    svg.append(trazo);
  }

  const ruta = puntos.map((punto, indice) => `${indice === 0 ? "M" : "L"}${punto.x.toFixed(2)} ${punto.y.toFixed(2)}`).join(" ");
  if (puntos.length > 1) {
    const linea = document.createElementNS("http://www.w3.org/2000/svg", "path");
    linea.setAttribute("d", ruta);
    linea.setAttribute("class", "perfil-grafica__linea");
    svg.append(linea);
  }

  for (const [indice, punto] of puntos.entries()) {
    const circulo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circulo.setAttribute("cx", String(punto.x));
    circulo.setAttribute("cy", String(punto.y));
    circulo.setAttribute("r", "5");
    circulo.setAttribute("class", "perfil-grafica__punto");
    const descripcion = document.createElementNS("http://www.w3.org/2000/svg", "title");
    descripcion.textContent = `${formatearFecha(punto.fecha)}: ${punto.valor} kg`;
    circulo.append(descripcion);
    svg.append(circulo);

    if (indice === 0 || indice === puntos.length - 1) {
      const etiquetaFecha = document.createElementNS("http://www.w3.org/2000/svg", "text");
      etiquetaFecha.setAttribute("x", String(punto.x));
      etiquetaFecha.setAttribute("y", "244");
      etiquetaFecha.setAttribute("text-anchor", indice === 0 ? "start" : indice === puntos.length - 1 ? "end" : "middle");
      etiquetaFecha.setAttribute("class", "perfil-grafica__etiqueta");
      etiquetaFecha.textContent = formatearFecha(punto.fecha, { day: "2-digit", month: "short", year: "2-digit" });
      svg.append(etiquetaFecha);

      const etiquetaValor = document.createElementNS("http://www.w3.org/2000/svg", "text");
      etiquetaValor.setAttribute("x", String(punto.x));
      etiquetaValor.setAttribute("y", String(Math.max(14, punto.y - 12)));
      etiquetaValor.setAttribute("text-anchor", "middle");
      etiquetaValor.setAttribute("class", "perfil-grafica__valor");
      etiquetaValor.textContent = `${punto.valor} kg`;
      svg.append(etiquetaValor);
    }
  }
  contenedor.append(svg);
}

/** Normaliza la fecha/hora de una cita para filtrar únicamente citas futuras. */
function fechaHoraCita(cita) {
  const fecha = cita.fecha_cita || cita.fecha_evento;
  const hora = cita.hora_cita || cita.hora_evento || "00:00:00";
  if (!fecha) return null;
  const resultado = new Date(`${fecha}T${hora}`);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

/** Crea una fila de solo lectura para una cita próxima, sin acciones de administración. */
function crearFilaCita(cita) {
  const fila = crearElemento("article", { clase: "perfil-lista__item" });
  const contenido = crearElemento("div", { clase: "perfil-lista__contenido" });
  const nombre = cita.motivo_nombre || cita.nombre_motivo || cita.nombre || "Cita veterinaria";
  const veterinaria = cita.veterinaria_nombre || cita.nombre_veterinaria;
  const fecha = fechaHoraCita(cita);
  contenido.append(
    crearElemento("span", { clase: "perfil-lista__titulo", texto: nombre }),
    crearElemento("span", { clase: "perfil-lista__detalle", texto: [fecha ? formatearFecha(fecha) : formatearFecha(cita.fecha_cita), cita.hora_cita ? formatearHora(cita.hora_cita) : null, veterinaria].filter(Boolean).join(" · ") })
  );
  const estado = cita.estado || null;
  const etiqueta = estado === "confirmada" ? "Confirmada" : estado === "pendiente" ? "Pendiente" : estado === "completada" ? "Completada" : estado === "cancelada" ? "Cancelada" : "Estado no informado";
  const claseEstado = estado === "confirmada" ? "pastilla--confirmada" : estado === "completada" ? "pastilla--completada" : estado === "cancelada" ? "pastilla--cancelada" : estado === "pendiente" ? "pastilla--pendiente" : "";
  fila.append(contenido, crearElemento("span", { clase: `pastilla ${claseEstado}`.trim(), texto: etiqueta }));
  return fila;
}

/** Renderiza citas futuras en solo lectura y omite canceladas o ya completadas. */
function renderizarCitas(contenedor, citas) {
  const ahora = new Date();
  const futuras = citas.filter((cita) => {
    if (cita.estado === "cancelada" || cita.estado === "completada") return false;
    const fecha = fechaHoraCita(cita);
    return fecha ? fecha >= ahora : false;
  }).sort((a, b) => fechaHoraCita(a) - fechaHoraCita(b));
  if (!futuras.length) {
    renderizarVacio(contenedor, "No hay próximas citas registradas para esta mascota.");
    return;
  }
  const fragmento = document.createDocumentFragment();
  for (const cita of futuras) fragmento.append(crearFilaCita(cita));
  contenedor.replaceChildren(fragmento);
}

/** Traduce estados calculados por la vista de vacunaciones sin asumir un estado no recibido. */
function estadoVacuna(vacunacion) {
  const estados = {
    al_dia: { texto: "Al día", clase: "pastilla--al-dia" },
    proxima: { texto: "Próxima", clase: "pastilla--proxima" },
    vencida: { texto: "Vencida", clase: "pastilla--vencida" }
  };
  return estados[vacunacion.estado] || { texto: vacunacion.estado || "Estado no informado", clase: "" };
}

/** Renderiza el historial de vacunas en modo de consulta; la escritura corresponde al administrador. */
function renderizarVacunas(contenedor, vacunaciones) {
  if (!vacunaciones.length) {
    renderizarVacio(contenedor, "Todavía no hay vacunas registradas para esta mascota. El administrador actualizará este historial cuando registre una aplicación.");
    return;
  }
  const ordenadas = [...vacunaciones].sort((a, b) => textoSeguro(b.fecha_aplicacion).localeCompare(textoSeguro(a.fecha_aplicacion)));
  const fragmento = document.createDocumentFragment();
  for (const vacunacion of ordenadas) {
    const fila = crearElemento("article", { clase: "perfil-lista__item" });
    const contenido = crearElemento("div", { clase: "perfil-lista__contenido" });
    const nombre = vacunacion.vacuna_nombre || vacunacion.nombre_vacuna || "Vacuna";
    const detalles = [`Aplicada: ${formatearFecha(vacunacion.fecha_aplicacion)}`];
    if (vacunacion.proxima_dosis) detalles.push(`Próxima dosis: ${formatearFecha(vacunacion.proxima_dosis)}`);
    if (vacunacion.veterinaria_nombre) detalles.push(vacunacion.veterinaria_nombre);
    contenido.append(crearElemento("span", { clase: "perfil-lista__titulo", texto: nombre }), crearElemento("span", { clase: "perfil-lista__detalle", texto: detalles.join(" · ") }));
    const estado = estadoVacuna(vacunacion);
    fila.append(contenido, crearElemento("span", { clase: `pastilla ${estado.clase}`.trim(), texto: estado.texto }));
    fragmento.append(fila);
  }
  contenedor.replaceChildren(fragmento);
}

/** Crea una entrada de recordatorio con la acción para marcarlo como completado. */
function crearFilaRecordatorio(recordatorio) {
  const fila = crearElemento("article", { clase: "perfil-lista__item" });
  const contenido = crearElemento("div", { clase: "perfil-lista__contenido" });
  const detalles = [formatearFechaHora(recordatorio.fecha_hora), recordatorio.descripcion].filter(Boolean);
  contenido.append(crearElemento("span", { clase: "perfil-lista__titulo", texto: recordatorio.titulo || "Recordatorio" }), crearElemento("span", { clase: "perfil-lista__detalle", texto: detalles.join(" · ") }));
  const acciones = crearElemento("div", { clase: "perfil-recordatorio__acciones" });
  if (estaCompletado(recordatorio.completado)) {
    acciones.append(crearElemento("span", { clase: "pastilla pastilla--completada", texto: "Completado" }));
  } else {
    const boton = crearElemento("button", { clase: "perfil-recordatorio__completar", texto: "Completar", atributos: { type: "button" } });
    boton.addEventListener("click", () => completarRecordatorio(recordatorio.id, boton));
    acciones.append(boton);
  }
  fila.append(contenido, acciones);
  return fila;
}

/** Dibuja recordatorios activos y completados; cada cambio lo confirma primero el servidor. */
function renderizarRecordatorios(contenedor, recordatorios) {
  if (!recordatorios.length) {
    renderizarVacio(contenedor, "No hay recordatorios para esta mascota. Crea uno para organizar sus próximos cuidados.");
    return;
  }
  const ordenados = [...recordatorios].sort((a, b) => textoSeguro(a.fecha_hora).localeCompare(textoSeguro(b.fecha_hora)));
  const fragmento = document.createDocumentFragment();
  for (const recordatorio of ordenados) fragmento.append(crearFilaRecordatorio(recordatorio));
  contenedor.replaceChildren(fragmento);
}

/** Carga un recurso aislado y muestra un botón de reintento si su endpoint falla. */
async function cargarSeccion(contenedor, consulta, renderizador, mensaje) {
  contenedor.replaceChildren(crearElemento("div", { clase: "mascotas-cargando", atributos: { role: "status", "aria-label": "Cargando información" } }));
  contenedor.setAttribute("aria-busy", "true");
  try {
    const respuesta = await consulta();
    renderizador(contenedor, obtenerLista(respuesta));
    contenedor.setAttribute("aria-busy", "false");
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    const bloque = crearElemento("div", { clase: "perfil-error", atributos: { role: "alert" } });
    bloque.append(crearElemento("p", { texto: mensaje || error?.error || error?.message || "No se pudo cargar esta sección." }));
    const boton = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
    boton.addEventListener("click", () => cargarSeccion(contenedor, consulta, renderizador, mensaje), { once: true });
    bloque.append(boton);
    contenedor.replaceChildren(bloque);
  }
}

/** Limpia errores de formulario antes de presentar una nueva operación. */
function limpiarErrores(formulario, mensaje) {
  for (const campo of formulario.querySelectorAll("[aria-invalid='true']")) campo.removeAttribute("aria-invalid");
  for (const zona of formulario.querySelectorAll("[data-error]")) zona.textContent = "";
  mensaje.hidden = true;
  mensaje.textContent = "";
}

/** Asocia los mensajes { error, campos } enviados por el backend con sus controles. */
function mostrarErrorFormulario(formulario, mensaje, error) {
  for (const [nombre, detalle] of Object.entries(error?.campos || {})) {
    const campo = formulario.elements.namedItem(nombre);
    const zona = formulario.querySelector(`[data-error="${CSS.escape(nombre)}"]`);
    if (campo instanceof HTMLElement) campo.setAttribute("aria-invalid", "true");
    if (zona) zona.textContent = Array.isArray(detalle) ? detalle.join(" ") : textoSeguro(detalle);
  }
  mensaje.textContent = error?.error || error?.message || "No fue posible completar la operación.";
  mensaje.hidden = false;
}

/** Abre un modal accesible y enfoca su primer control. */
function abrirModal(id) {
  const dialogo = document.getElementById(id);
  if (dialogo && !dialogo.open) dialogo.showModal();
  dialogo?.querySelector("input, select, textarea")?.focus();
}

/** Convierte datetime-local a la representación DATETIME de MySQL que espera el servidor. */
function normalizarFechaHora(valor) {
  if (!valor) return null;
  return valor.replace("T", " ").length === 16 ? `${valor.replace("T", " ")}:00` : valor.replace("T", " ");
}

/** Registra una medición nueva y vuelve a consultar el historial real de peso. */
async function enviarPeso(evento) {
  evento.preventDefault();
  if (enviandoPeso) return;
  const formulario = evento.currentTarget;
  const boton = document.querySelector("#guardar-peso");
  const mensaje = document.querySelector("#formulario-peso-mensaje");
  limpiarErrores(formulario, mensaje);
  const peso = Number(formulario.elements.peso_kg.value);
  const fecha = formulario.elements.medido_en.value;
  if (!Number.isFinite(peso) || peso <= 0 || !fecha) {
    mostrarErrorFormulario(formulario, mensaje, { message: "Ingresa un peso mayor que cero y una fecha de medición." });
    return;
  }
  enviandoPeso = true;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    await api.pesos.registrar(mascotaActual.id, { peso_kg: peso, medido_en: fecha });
    formulario.reset();
    document.querySelector("#modal-peso").close();
    await cargarPerfilActual();
  } catch (error) {
    mostrarErrorFormulario(formulario, mensaje, error);
  } finally {
    enviandoPeso = false;
    boton.disabled = false;
    boton.textContent = "Registrar peso";
  }
}

/** Crea un recordatorio vinculado únicamente a la mascota cuyo perfil está abierto. */
async function enviarRecordatorio(evento) {
  evento.preventDefault();
  if (enviandoRecordatorio) return;
  const formulario = evento.currentTarget;
  const boton = document.querySelector("#guardar-recordatorio");
  const mensaje = document.querySelector("#formulario-recordatorio-mensaje");
  limpiarErrores(formulario, mensaje);
  if (!formulario.reportValidity()) return;
  enviandoRecordatorio = true;
  boton.disabled = true;
  boton.textContent = "Creando…";
  try {
    const datos = {
      tipo: formulario.elements.tipo.value,
      titulo: formulario.elements.titulo.value.trim(),
      descripcion: formulario.elements.descripcion.value.trim() || null,
      fecha_hora: normalizarFechaHora(formulario.elements.fecha_hora.value)
    };
    await api.recordatorios.crearParaMascota(mascotaActual.id, datos);
    formulario.reset();
    document.querySelector("#modal-recordatorio").close();
    await cargarRecordatorios();
  } catch (error) {
    mostrarErrorFormulario(formulario, mensaje, error);
  } finally {
    enviandoRecordatorio = false;
    boton.disabled = false;
    boton.textContent = "Crear recordatorio";
  }
}

/** Marca completado un recordatorio mediante el endpoint dedicado y recarga la lista. */
async function completarRecordatorio(id, boton) {
  boton.disabled = true;
  boton.textContent = "Actualizando…";
  try {
    await api.recordatorios.completar(id);
    await cargarRecordatorios();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = "Completar";
    const aviso = crearElemento("p", { clase: "perfil-error", texto: error?.error || error?.message || "No se pudo completar el recordatorio." });
    document.querySelector("#perfil-recordatorios")?.prepend(aviso);
  }
}

/** Carga el historial de recordatorios del perfil con el endpoint anidado de mascota. */
async function cargarRecordatorios() {
  const contenedor = document.querySelector("#perfil-recordatorios");
  await cargarSeccion(contenedor, () => api.recordatorios.listarPorMascota(mascotaActual.id), renderizarRecordatorios);
}

/** Consulta el detalle principal y los recursos del perfil sin compartir estados entre secciones. */
async function cargarPesos() {
  const grafica = document.querySelector("#perfil-grafica");
  grafica.replaceChildren(crearElemento("div", { clase: "mascotas-cargando", atributos: { role: "status", "aria-label": "Cargando historial de peso" } }));
  try {
    const respuesta = await api.pesos.listar(mascotaActual.id);
    const pesos = obtenerLista(respuesta);
    renderizarHero(document.querySelector("#perfil-hero"), mascotaActual, pesos);
    renderizarInformacionGeneral(document.querySelector("#perfil-general-datos"), mascotaActual, pesos);
    renderizarGrafica(grafica, pesos);
  } catch (error) {
    const bloque = crearElemento("div", { clase: "perfil-error", atributos: { role: "alert" } });
    bloque.append(crearElemento("p", { texto: error?.error || error?.message || "No se pudo cargar la evolución del peso." }));
    const reintentar = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
    reintentar.addEventListener("click", cargarPesos, { once: true });
    bloque.append(reintentar);
    grafica.replaceChildren(bloque);
  }
}

/** Consulta los datos principales; los recursos secundarios cargan de forma independiente. */
async function cargarPerfilActual() {
  const id = new URLSearchParams(window.location.search).get("id");
  const respuesta = await api.mascotas.obtener(id);
  mascotaActual = respuesta?.mascota || respuesta;
  if (!mascotaActual?.id) throw new Error("El servidor no devolvió el perfil de la mascota solicitada.");

  renderizarHero(document.querySelector("#perfil-hero"), mascotaActual, []);
  renderizarInformacionGeneral(document.querySelector("#perfil-general-datos"), mascotaActual, []);
  const idMascota = mascotaActual.id;
  await Promise.all([
    cargarPesos(),
    cargarSeccion(document.querySelector("#perfil-citas"), () => api.citas.listar({ mascota_id: idMascota }), renderizarCitas, "No se pudieron consultar las próximas citas."),
    cargarRecordatorios(),
    cargarSeccion(document.querySelector("#perfil-vacunas"), () => api.vacunas.listarAplicaciones({ mascota_id: idMascota }), renderizarVacunas, "No se pudo consultar el historial de vacunas.")
  ]);
}

/** Configura cierres de diálogos, formularios y acciones una sola vez. */
function conectarFormularios() {
  const formularioPeso = document.querySelector("#formulario-peso");
  const formularioRecordatorio = document.querySelector("#formulario-recordatorio");
  formularioPeso.addEventListener("submit", enviarPeso);
  formularioRecordatorio.addEventListener("submit", enviarRecordatorio);
  for (const boton of document.querySelectorAll("[data-cerrar-peso]")) boton.addEventListener("click", () => document.querySelector("#modal-peso").close());
  for (const boton of document.querySelectorAll("[data-cerrar-recordatorio]")) boton.addEventListener("click", () => document.querySelector("#modal-recordatorio").close());
  for (const dialogo of document.querySelectorAll("dialog")) {
    dialogo.addEventListener("click", (evento) => { if (evento.target === dialogo) dialogo.close(); });
  }
}

/** Renderiza un error del perfil principal con reintento sin fabricar un registro alternativo. */
function mostrarErrorPrincipal(contenedor, error) {
  contenedor.setAttribute("aria-busy", "false");
  const tarjeta = crearElemento("section", { clase: "mascotas-estado", atributos: { role: "alert" } });
  tarjeta.append(
    crearElemento("h1", { texto: "No pudimos abrir este perfil" }),
    crearElemento("p", { texto: error?.error || error?.message || "Comprueba que la mascota siga activa e inténtalo de nuevo." })
  );
  const acciones = crearElemento("div", { clase: "mascotas-encabezado__acciones" });
  const reintentar = crearElemento("button", { clase: "boton", texto: "Reintentar", atributos: { type: "button" } });
  reintentar.addEventListener("click", iniciar, { once: true });
  const volver = crearElemento("a", { clase: "boton boton--secundario", texto: "Volver a Mis mascotas", atributos: { href: RUTAS.mascotas } });
  acciones.append(reintentar, volver);
  tarjeta.append(acciones);
  contenedor.replaceChildren(tarjeta);
}

/** Protege la página para usuarios y solo entonces inicia el layout y consulta el perfil. */
async function iniciar() {
  const raiz = document.querySelector("#app");
  if (!raiz) return;
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    mostrarErrorPrincipal(raiz, new Error("No se indicó qué mascota deseas consultar."));
    return;
  }
  try {
    const sesion = await protegerPagina({ roles: ["usuario"], loginUrl: RUTAS.login, inicioUrl: RUTAS.administrador });
    if (!sesion) return;
    const layout = montarLayout({ contenedor: raiz, sesion, titulo: "Perfil de mascota", paginaActual: "/mascotas.html" });
    construirPerfil(layout.contenido);
    conectarFormularios();
    await cargarPerfilActual();
    raiz.setAttribute("aria-busy", "false");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    mostrarErrorPrincipal(raiz, error);
  }
}

iniciar();
