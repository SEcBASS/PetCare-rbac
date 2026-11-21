/** Utilidades puras para formatos, edad, seguridad de texto y rendimiento de eventos. */

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "long",
  year: "numeric"
});

const formatoHora = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});

/** Interpreta DATE de MySQL sin desplazar el día por conversión UTC. */
function fechaLocal(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

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

/** Formatea una fecha como día, mes y año en español de Colombia. */
export function formatearFecha(valor, opciones = {}) {
  const fecha = fechaLocal(valor);
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-CO", { ...opciones, day: "2-digit", month: "long", year: "numeric" }).format(fecha);
}

/** Formatea una hora TIME de MySQL o una fecha-hora válida en español de Colombia. */
export function formatearHora(valor) {
  if (!valor) return "—";
  const texto = String(valor).trim();
  const coincidencia = texto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (coincidencia) {
    const fecha = new Date(2000, 0, 1, Number(coincidencia[1]), Number(coincidencia[2]));
    return formatoHora.format(fecha);
  }
  const fecha = fechaLocal(valor);
  return fecha ? formatoHora.format(fecha) : "—";
}

/** Formatea un DATETIME de MySQL como fecha y hora local. */
export function formatearFechaHora(valor) {
  if (!valor) return "—";
  const texto = String(valor).trim();
  const coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (coincidencia) {
    const [, anio, mes, dia, hora, minuto, segundo = "0"] = coincidencia;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));
    return formatoFechaHora.format(fecha);
  }
  const fecha = fechaLocal(valor);
  return fecha ? formatoFechaHora.format(fecha) : "—";
}

/** Calcula una edad legible a partir de MASCOTAS.fecha_nacimiento; no inventa edades si falta el dato. */
export function calcularEdad(fechaNacimiento, fechaReferencia = new Date()) {
  const nacimiento = fechaLocal(fechaNacimiento);
  const referencia = fechaLocal(fechaReferencia);
  if (!nacimiento || !referencia || nacimiento > referencia) return null;

  let anios = referencia.getFullYear() - nacimiento.getFullYear();
  let meses = referencia.getMonth() - nacimiento.getMonth();
  const dias = referencia.getDate() - nacimiento.getDate();

  if (dias < 0) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }

  if (anios > 0) {
    return meses > 0 ? `${anios} ${anios === 1 ? "año" : "años"} y ${meses} ${meses === 1 ? "mes" : "meses"}` : `${anios} ${anios === 1 ? "año" : "años"}`;
  }
  if (meses > 0) return `${meses} ${meses === 1 ? "mes" : "meses"}`;

  const diasTotales = Math.floor((referencia.getTime() - nacimiento.getTime()) / 86400000);
  return `${Math.max(0, diasTotales)} ${diasTotales === 1 ? "día" : "días"}`;
}

/** Convierte cualquier valor a texto plano seguro para insertar mediante textContent. */
export function textoSeguro(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

/** Escapa caracteres HTML si el texto necesita incluirse en un contexto HTML textual. */
export function escaparHTML(valor) {
  return textoSeguro(valor).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

/** Limita la frecuencia de ejecución de una función, conservando this y argumentos. */
export function debounce(funcion, espera = 250) {
  if (typeof funcion !== "function") throw new TypeError("debounce requiere una función.");
  let temporizador;
  return function (...argumentos) {
    const contexto = this;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcion.apply(contexto, argumentos), espera);
  };
}

/** Devuelve un texto corto para un nombre, usado como alternativa al avatar. */
export function iniciales(nombre) {
  const partes = textoSeguro(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "P";
  return partes.slice(0, 2).map((parte) => Array.from(parte)[0].toLocaleUpperCase("es-CO")).join("");
}
