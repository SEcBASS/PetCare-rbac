/** Lógica de la sección Mis mascotas: listado, filtros y formulario CRUD del dueño. */
import { api, ApiError } from "./api.js";
import { protegerPagina } from "./sesion.js";
import { montarLayout } from "./layout.js";
import { calcularEdad, debounce, formatearFecha, textoSeguro } from "./utils.js";

const RUTAS = { login: "/login.html", inicio: "/inicio.html", administrador: "/admin-usuarios.html", perfil: "/mascota.html" };
const MAXIMO_FOTO_BYTES = 4 * 1024 * 1024;
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const ICONOS = {
  huella: ["M7.2 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M16.8 11.2c-1.4 0-2.5-1.5-2.5-3.3s1.1-3.2 2.5-3.2 2.5 1.4 2.5 3.2-1.1 3.3-2.5 3.3Z", "M4.4 16.2c0-2.3 2.7-4.2 7.6-4.2s7.6 1.9 7.6 4.2-2.5 4.8-4.5 4.8c-1.4 0-1.8-1.7-3.1-1.7s-1.7 1.7-3.1 1.7c-2 0-4.5-2.5-4.5-4.8Z"],
  buscar: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
  editar: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"],
  eliminar: ["M3 6h18", "M8 6V4h8v2", "m19 6-1 14H6L5 6", "M10 11v5", "M14 11v5"],
  agregar: ["M12 5v14", "M5 12h14"]
};

let sesionActual = null;
let layoutActual = null;
let mascotasActuales = [];
let especiesDisponibles = [];
let filtroActual = "todas";
let terminoActual = "";
let mascotaEnEdicion = null;
let fotoUrlTemporal = null;
let quitarFotoActual = false;
let enviandoFormulario = false;

/** Crea nodos y asigna texto mediante textContent para no interpretar datos del servidor. */
function crearElemento(etiqueta, { clase, texto, atributos = {} } = {}) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = textoSeguro(texto);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor !== undefined && valor !== null) nodo.setAttribute(nombre, String(valor));
  }
  return nodo;
}

/** Construye iconos SVG usando únicamente trazos estáticos del módulo. */
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

/** Normaliza respuestas que el servidor puede devolver como arreglo o dentro de datos. */
function obtenerLista(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  if (Array.isArray(respuesta?.datos)) return respuesta.datos;
  if (Array.isArray(respuesta?.mascotas)) return respuesta.mascotas;
  return [];
}

/** Obtiene el nombre de especie desde el alias de la vista o desde el catálogo cargado. */
function nombreEspecie(mascota) {
  if (mascota.nombre_especie) return textoSeguro(mascota.nombre_especie);
  const especie = especiesDisponibles.find((item) => String(item.id) === String(mascota.especie_id));
  return especie?.nombre || "Especie no registrada";
}

/** Restringe imágenes a HTTPS o al mismo origen antes de asignarlas a src. */
function obtenerFotoSegura(valor) {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor, window.location.origin);
    return url.protocol === "https:" || url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Traduce los estados de salud de MASCOTAS a etiquetas de interfaz sin modificar su valor. */
function estadoSalud(estado) {
  const estados = {
    excelente: { texto: "Excelente", clase: "pastilla--al-dia" },
    bueno: { texto: "Bueno", clase: "pastilla--confirmada" },
    requiere_atencion: { texto: "Requiere atención", clase: "pastilla--proxima" }
  };
  return estados[estado] || { texto: "Estado no registrado", clase: "" };
}

/** Obtiene un valor de edad calculado por el servidor o por la fecha_nacimiento disponible. */
function edadMascota(mascota) {
  if (mascota.edad_anios !== undefined && mascota.edad_anios !== null) {
    const anios = Number(mascota.edad_anios);
    if (Number.isFinite(anios)) return `${anios} ${anios === 1 ? "año" : "años"}`;
  }
  return calcularEdad(mascota.fecha_nacimiento) || "No registrada";
}

/** Evita convertir campos ausentes en datos falsos y añade unidad solo a pesos válidos. */
function pesoMascota(mascota) {
  const peso = mascota.peso_actual_kg ?? mascota.peso_kg;
  if (peso === null || peso === undefined || peso === "") return "No registrado";
  const valor = Number(peso);
  return Number.isFinite(valor) ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(valor)} kg` : "No registrado";
}

/** Crea una tarjeta de mascota con acciones de perfil, edición y desactivación lógica. */
function crearTarjeta(mascota) {
  const tarjeta = crearElemento("article", { clase: "mascota-tarjeta" });
  const foto = crearElemento("div", { clase: "mascota-tarjeta__foto" });
  const rutaFoto = obtenerFotoSegura(mascota.foto_url);

  if (rutaFoto) {
    const imagen = crearElemento("img", { atributos: { src: rutaFoto, alt: `Fotografía de ${mascota.nombre || "la mascota"}`, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } });
    imagen.addEventListener("error", () => { imagen.remove(); foto.append(crearIcono("huella")); }, { once: true });
    foto.append(imagen);
  } else {
    foto.append(crearIcono("huella"));
    foto.setAttribute("aria-label", "No hay fotografía registrada");
  }

  const estado = estadoSalud(mascota.estado_salud);
  const pastilla = crearElemento("span", { clase: `pastilla mascota-tarjeta__estado ${estado.clase}`.trim(), texto: estado.texto });
  foto.append(pastilla);

  const cuerpo = crearElemento("div", { clase: "mascota-tarjeta__cuerpo" });
  const encabezado = crearElemento("div", { clase: "mascota-tarjeta__encabezado" });
  const nombreBloque = crearElemento("div");
  nombreBloque.append(
    crearElemento("h2", { clase: "mascota-tarjeta__nombre", texto: mascota.nombre || "Mascota" }),
    crearElemento("p", { clase: "mascota-tarjeta__subtitulo", texto: [nombreEspecie(mascota), mascota.nombre_raza].filter(Boolean).join(" · ") })
  );
  encabezado.append(nombreBloque);

  const datos = crearElemento("dl", { clase: "mascota-tarjeta__datos" });
  const valores = [
    ["Raza", mascota.nombre_raza || "No registrada"],
    ["Edad", edadMascota(mascota)],
    ["Peso", pesoMascota(mascota)]
  ];
  for (const [etiqueta, valor] of valores) {
    const dato = crearElemento("div", { clase: "mascota-dato" });
    dato.append(crearElemento("dt", { texto: etiqueta }), crearElemento("dd", { texto: valor }));
    datos.append(dato);
  }

  const acciones = crearElemento("div", { clase: "mascota-tarjeta__acciones" });
  const perfil = crearElemento("a", { clase: "boton boton--secundario", texto: "Ver perfil", atributos: { href: `${RUTAS.perfil}?id=${encodeURIComponent(String(mascota.id))}` } });
  const editar = crearElemento("button", { clase: "mascota-accion-icono", atributos: { type: "button", "aria-label": `Editar ${mascota.nombre || "mascota"}`, title: "Editar" } });
  editar.append(crearIcono("editar"));
  editar.addEventListener("click", () => abrirModalMascota("editar", mascota));
  const eliminar = crearElemento("button", { clase: "mascota-accion-icono mascota-accion-icono--peligro", atributos: { type: "button", "aria-label": `Desactivar ${mascota.nombre || "mascota"}`, title: "Desactivar mascota" } });
  eliminar.append(crearIcono("eliminar"));
  eliminar.addEventListener("click", () => desactivarMascota(mascota));
  acciones.append(perfil, editar, eliminar);
  cuerpo.append(encabezado, datos, acciones);
  tarjeta.append(foto, cuerpo);
  return tarjeta;
}

/** Inserta un estado sin mascotas con una acción directa para registrar la primera. */
function renderizarVacio(contenedor) {
  const bloque = crearElemento("section", { clase: "mascotas-estado", atributos: { "aria-labelledby": "mascotas-vacio-titulo" } });
  const icono = crearElemento("span", { clase: "mascotas-estado__icono", atributos: { "aria-hidden": "true" } });
  icono.append(crearIcono("huella"));
  bloque.append(icono,
    crearElemento("h2", { texto: "Todavía no has agregado una mascota", atributos: { id: "mascotas-vacio-titulo" } }),
    crearElemento("p", { texto: "Registra a tu compañero para organizar su información, hacer seguimiento a su peso y consultar sus cuidados." })
  );
  const boton = crearElemento("button", { clase: "boton", texto: "+ Agregar mi primera mascota", atributos: { type: "button" } });
  boton.addEventListener("click", () => abrirModalMascota("crear"));
  bloque.append(boton);
  contenedor.replaceChildren(bloque);
}

/** Muestra una respuesta vacía cuando ningún registro coincide con la búsqueda o filtro activo. */
function renderizarSinCoincidencias(contenedor) {
  const bloque = crearElemento("div", { clase: "mascotas-estado" });
  bloque.append(
    crearElemento("h2", { texto: "No encontramos coincidencias" }),
    crearElemento("p", { texto: "Prueba con otro nombre o cambia el filtro de especie." })
  );
  contenedor.replaceChildren(bloque);
}

/** Filtra en memoria por texto y especie; el listado original siempre proviene de la API. */
function renderizarMascotas() {
  const contenedor = document.querySelector("#mascotas-lista");
  if (!contenedor) return;

  if (!mascotasActuales.length) {
    renderizarVacio(contenedor);
    return;
  }

  const coincidencias = mascotasActuales.filter((mascota) => {
    const especie = nombreEspecie(mascota).toLocaleLowerCase("es-CO");
    const nombre = textoSeguro(mascota.nombre).toLocaleLowerCase("es-CO");
    const coincideNombre = nombre.includes(terminoActual);
    const esPerro = /perro|canino/.test(especie);
    const esGato = /gato|felino/.test(especie);
    const coincideFiltro = filtroActual === "todas" || (filtroActual === "perro" && esPerro) || (filtroActual === "gato" && esGato);
    return coincideNombre && coincideFiltro;
  });

  if (!coincidencias.length) {
    renderizarSinCoincidencias(contenedor);
    return;
  }

  const fragmento = document.createDocumentFragment();
  for (const mascota of coincidencias) fragmento.append(crearTarjeta(mascota));
  contenedor.replaceChildren(fragmento);
}

/** Construye la vista de listado dentro del contenedor central que entrega el layout compartido. */
function construirPagina(contenedor) {
  const raiz = crearElemento("div", { clase: "mascotas-contenido" });
  const encabezado = crearElemento("header", { clase: "mascotas-encabezado" });
  const textos = crearElemento("div", { clase: "mascotas-encabezado__texto" });
  textos.append(
    crearElemento("p", { clase: "mascotas-encabezado__sobrelinea", texto: "El hogar de tus compañeros" }),
    crearElemento("h1", { texto: "Mis mascotas" }),
    crearElemento("p", { texto: "Consulta y organiza la información de tus perros y gatos." })
  );
  const acciones = crearElemento("div", { clase: "mascotas-encabezado__acciones" });
  const agregar = crearElemento("button", { clase: "boton", texto: "+ Agregar mascota", atributos: { type: "button" } });
  agregar.addEventListener("click", () => abrirModalMascota("crear"));
  acciones.append(agregar);
  encabezado.append(textos, acciones);

  const filtros = crearElemento("section", { clase: "mascotas-filtros", atributos: { "aria-label": "Buscar y filtrar mascotas" } });
  const buscador = crearElemento("label", { clase: "mascotas-buscador" });
  buscador.append(crearIcono("buscar"));
  const campo = crearElemento("input", { atributos: { id: "buscar-mascotas", type: "search", placeholder: "Buscar por nombre…", autocomplete: "off", "aria-label": "Buscar mascotas por nombre" } });
  campo.addEventListener("input", debounce(() => {
    terminoActual = campo.value.trim().toLocaleLowerCase("es-CO");
    renderizarMascotas();
  }, 160));
  buscador.append(campo);

  const grupoFiltros = crearElemento("div", { clase: "mascotas-filtros__botones", atributos: { role: "group", "aria-label": "Filtrar por especie" } });
  const filtrosDatos = [["todas", "Todas"], ["perro", "Perro"], ["gato", "Gato"]];
  for (const [valor, etiqueta] of filtrosDatos) {
    const boton = crearElemento("button", { clase: "mascotas-filtro", texto: etiqueta, atributos: { type: "button", "aria-pressed": valor === filtroActual ? "true" : "false" } });
    boton.addEventListener("click", () => {
      filtroActual = valor;
      for (const elemento of grupoFiltros.querySelectorAll("button")) {
        const clave = filtrosDatos.find((item) => item[1] === elemento.textContent)?.[0];
        elemento.setAttribute("aria-pressed", String(clave === filtroActual));
      }
      renderizarMascotas();
    });
    grupoFiltros.append(boton);
  }
  filtros.append(buscador, grupoFiltros);

  const aviso = crearElemento("div", { clase: "mascotas-aviso", atributos: { id: "mascotas-aviso", role: "status", "aria-live": "polite" } });
  const lista = crearElemento("section", { clase: "mascotas-rejilla", atributos: { id: "mascotas-lista", "aria-label": "Mascotas registradas", "aria-live": "polite", "aria-busy": "true" } });
  for (let indice = 0; indice < 3; indice += 1) lista.append(crearElemento("div", { clase: "mascotas-cargando mascotas-cargando--tarjeta" }));

  raiz.append(encabezado, filtros, aviso, lista);
  contenedor.replaceChildren(raiz);
  return { lista, campo };
}

/** Muestra una notificación de éxito o error en la región accesible de la página. */
function mostrarAviso(mensaje, tipo = "info") {
  const region = document.querySelector("#mascotas-aviso");
  if (!region) return;
  region.className = tipo === "error" ? "mascotas-error" : "perfil-mensaje";
  region.textContent = textoSeguro(mensaje);
}

/** Carga el catálogo de ESPECIES y limita la lista del formulario a perro y gato. */
async function cargarEspecies() {
  const respuesta = await api.catalogos.listarEspecies();
  const datos = obtenerLista(respuesta);
  especiesDisponibles = datos.filter((especie) => /perro|canino|gato|felino/i.test(textoSeguro(especie.nombre)));
  const selector = document.querySelector("#mascota-especie");
  selector.replaceChildren(crearElemento("option", { texto: "Selecciona una especie", atributos: { value: "" } }));
  for (const especie of especiesDisponibles) {
    selector.append(crearElemento("option", { texto: especie.nombre, atributos: { value: especie.id } }));
  }
  if (!especiesDisponibles.length) throw new Error("El catálogo no contiene las especies perro y gato.");
}

/** Consulta razas según la especie seleccionada y conserva el nombre/identificador de RAZAS. */
async function cargarRazas(especieId, razaSeleccionada = null) {
  const selector = document.querySelector("#mascota-raza");
  selector.disabled = true;
  selector.replaceChildren(crearElemento("option", { texto: "Cargando razas…", atributos: { value: "" } }));
  if (!especieId) {
    selector.replaceChildren(crearElemento("option", { texto: "Selecciona primero una especie", atributos: { value: "" } }));
    return;
  }
  const respuesta = await api.catalogos.listarRazas({ especie_id: especieId });
  const razas = obtenerLista(respuesta);
  selector.replaceChildren(crearElemento("option", { texto: "Sin raza específica", atributos: { value: "" } }));
  for (const raza of razas) selector.append(crearElemento("option", { texto: raza.nombre, atributos: { value: raza.id } }));
  selector.disabled = false;
  if (razaSeleccionada !== null && razaSeleccionada !== undefined) selector.value = String(razaSeleccionada);
}

/** Limpia errores de campos y mensajes generales al abrir un formulario. */
function limpiarErroresFormulario(formulario, mensaje) {
  for (const campo of formulario.querySelectorAll("[aria-invalid='true']")) campo.removeAttribute("aria-invalid");
  for (const error of formulario.querySelectorAll("[data-error]")) error.textContent = "";
  mensaje.hidden = true;
  mensaje.textContent = "";
}

/** Dibuja los errores devueltos por el backend en el formato { error, campos }. */
function mostrarErroresServidor(formulario, mensaje, error) {
  const campos = error instanceof ApiError ? error.campos : {};
  let tieneCampo = false;
  for (const [nombre, detalle] of Object.entries(campos || {})) {
    const campo = formulario.elements.namedItem(nombre);
    const zona = formulario.querySelector(`[data-error="${CSS.escape(nombre)}"]`);
    const texto = Array.isArray(detalle) ? detalle.join(" ") : textoSeguro(detalle);
    if (campo instanceof HTMLElement) campo.setAttribute("aria-invalid", "true");
    if (zona) { zona.textContent = texto; tieneCampo = true; }
  }
  mensaje.textContent = error?.error || error?.message || "No fue posible guardar la información.";
  mensaje.hidden = tieneCampo && !mensaje.textContent;
}

/** Convierte un archivo validado a base64 para transportarlo como JSON al endpoint de mascota. */
function leerFotoComoBase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const resultado = textoSeguro(lector.result);
      const separador = resultado.indexOf(",");
      if (separador < 0) { rechazar(new Error("No se pudo procesar la fotografía.")); return; }
      resolver({ nombre: archivo.name, tipo: archivo.type, contenido_base64: resultado.slice(separador + 1) });
    };
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo seleccionado."));
    lector.readAsDataURL(archivo);
  });
}

/** Reemplaza la previsualización anterior y libera cualquier URL temporal para evitar fugas. */
function mostrarVistaFoto(origen, esTemporal = false) {
  const vista = document.querySelector("#mascota-foto-vista");
  if (fotoUrlTemporal) URL.revokeObjectURL(fotoUrlTemporal);
  fotoUrlTemporal = null;
  vista.replaceChildren();
  if (origen) {
    let ruta = origen;
    if (esTemporal) {
      fotoUrlTemporal = URL.createObjectURL(origen);
      ruta = fotoUrlTemporal;
    }
    const imagen = crearElemento("img", { atributos: { src: ruta, alt: "Vista previa de la fotografía seleccionada" } });
    imagen.addEventListener("error", () => mostrarPlaceholderFoto(), { once: true });
    vista.append(imagen);
  } else {
    mostrarPlaceholderFoto();
  }
}

/** Muestra el estado vacío de fotografía cuando todavía no se ha seleccionado una imagen. */
function mostrarPlaceholderFoto() {
  const vista = document.querySelector("#mascota-foto-vista");
  vista.replaceChildren(crearElemento("span", { texto: "✿", atributos: { "aria-hidden": "true" } }), crearElemento("span", { texto: "Vista previa de la foto" }));
}

/** Inicializa el modal para alta o edición, carga las razas correspondientes y enfoca el primer campo. */
async function abrirModalMascota(modo, mascota = null) {
  const dialogo = document.querySelector("#modal-mascota");
  const formulario = document.querySelector("#formulario-mascota");
  const mensaje = document.querySelector("#formulario-mascota-mensaje");
  mascotaEnEdicion = modo === "editar" ? mascota : null;
  quitarFotoActual = false;
  limpiarErroresFormulario(formulario, mensaje);
  formulario.reset();
  document.querySelector("#modal-mascota-titulo").textContent = mascotaEnEdicion ? "Editar mascota" : "Agregar mascota";
  document.querySelector("#guardar-mascota").textContent = mascotaEnEdicion ? "Guardar cambios" : "Guardar mascota";
  document.querySelector("#quitar-foto").hidden = !mascotaEnEdicion?.foto_url;
  mostrarVistaFoto(mascotaEnEdicion ? obtenerFotoSegura(mascotaEnEdicion.foto_url) : null);

  if (mascotaEnEdicion) {
    formulario.elements.nombre.value = mascotaEnEdicion.nombre || "";
    formulario.elements.sexo.value = mascotaEnEdicion.sexo || "";
    formulario.elements.color.value = mascotaEnEdicion.color || "";
    formulario.elements.fecha_nacimiento.value = mascotaEnEdicion.fecha_nacimiento || "";
    formulario.elements.fecha_ingreso.value = mascotaEnEdicion.fecha_ingreso || "";
    formulario.elements.estado_salud.value = mascotaEnEdicion.estado_salud || "bueno";
  } else {
    formulario.elements.estado_salud.value = "bueno";
  }

  const selectorEspecie = document.querySelector("#mascota-especie");
  selectorEspecie.value = mascotaEnEdicion?.especie_id ? String(mascotaEnEdicion.especie_id) : "";
  try {
    await cargarRazas(selectorEspecie.value, mascotaEnEdicion?.raza_id ?? null);
  } catch {
    mostrarMensajeModal("No se pudieron cargar las razas. Intenta de nuevo.");
  }
  if (!especiesDisponibles.length) mostrarMensajeModal("No hay especies disponibles. Revisa el catálogo de Perro y Gato del servidor antes de guardar.");
  document.querySelector("#quitar-foto").hidden = !(mascotaEnEdicion?.foto_url);
  if (!dialogo.open) dialogo.showModal();
  formulario.elements.nombre.focus();
}

/** Presenta un mensaje general dentro del formulario de mascota. */
function mostrarMensajeModal(mensaje) {
  const zona = document.querySelector("#formulario-mascota-mensaje");
  zona.textContent = textoSeguro(mensaje);
  zona.hidden = false;
}

/** Valida campos esenciales y reglas locales de imagen antes de solicitar el guardado al servidor. */
function validarFormularioMascota(formulario) {
  let valido = true;
  const obligatorios = ["nombre", "especie_id", "sexo", "estado_salud"];
  for (const nombre of obligatorios) {
    const campo = formulario.elements.namedItem(nombre);
    if (!campo.value.trim()) {
      campo.setAttribute("aria-invalid", "true");
      const zona = formulario.querySelector(`[data-error="${nombre}"]`);
      if (zona) zona.textContent = "Este campo es obligatorio.";
      valido = false;
    }
  }
  const archivo = formulario.elements.foto.files[0];
  if (archivo && !TIPOS_FOTO.has(archivo.type)) {
    formulario.elements.foto.setAttribute("aria-invalid", "true");
    formulario.querySelector('[data-error="foto"]').textContent = "Selecciona una imagen JPG, PNG o WebP.";
    valido = false;
  } else if (archivo && archivo.size > MAXIMO_FOTO_BYTES) {
    formulario.elements.foto.setAttribute("aria-invalid", "true");
    formulario.querySelector('[data-error="foto"]').textContent = "La fotografía no puede superar los 4 MB.";
    valido = false;
  }
  return valido;
}

/** Construye los campos editables respetando los nombres de MASCOTAS y el campo fecha_ingreso. */
async function obtenerDatosFormulario(formulario) {
  const datos = {
    nombre: formulario.elements.nombre.value.trim(),
    especie_id: Number(formulario.elements.especie_id.value),
    raza_id: formulario.elements.raza_id.value ? Number(formulario.elements.raza_id.value) : null,
    sexo: formulario.elements.sexo.value,
    color: formulario.elements.color.value.trim() || null,
    fecha_nacimiento: formulario.elements.fecha_nacimiento.value || null,
    fecha_ingreso: formulario.elements.fecha_ingreso.value || null,
    estado_salud: formulario.elements.estado_salud.value
  };
  const archivo = formulario.elements.foto.files[0];
  if (archivo) datos.foto = await leerFotoComoBase64(archivo);
  else if (quitarFotoActual) datos.foto_url = null;
  return datos;
}

/** Guarda una mascota nueva o actualiza la existente, evitando envíos duplicados. */
async function enviarFormularioMascota(evento) {
  evento.preventDefault();
  if (enviandoFormulario) return;
  const formulario = evento.currentTarget;
  const mensaje = document.querySelector("#formulario-mascota-mensaje");
  const boton = document.querySelector("#guardar-mascota");
  limpiarErroresFormulario(formulario, mensaje);
  if (!validarFormularioMascota(formulario)) return;

  enviandoFormulario = true;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const datos = await obtenerDatosFormulario(formulario);
    if (mascotaEnEdicion) await api.mascotas.actualizar(mascotaEnEdicion.id, datos);
    else await api.mascotas.crear(datos);
    document.querySelector("#modal-mascota").close();
    mostrarAviso(mascotaEnEdicion ? "Los cambios de tu mascota se guardaron." : "Tu mascota se registró correctamente.");
    await cargarListado();
  } catch (error) {
    if (error instanceof ApiError) mostrarErroresServidor(formulario, mensaje, error);
    else mostrarMensajeModal(error.message || "No fue posible guardar la fotografía.");
    if (mensaje.hidden) mensaje.hidden = false;
  } finally {
    enviandoFormulario = false;
    boton.disabled = false;
    boton.textContent = mascotaEnEdicion ? "Guardar cambios" : "Guardar mascota";
  }
}

/** Desactiva la mascota con confirmación; el backend implementa DELETE como activa=0. */
async function desactivarMascota(mascota) {
  const nombre = textoSeguro(mascota.nombre || "esta mascota");
  const confirmado = window.confirm(`¿Quieres retirar a ${nombre} de tu listado? Su registro se desactivará, no se borrará físicamente.`);
  if (!confirmado) return;
  try {
    await api.mascotas.desactivar(mascota.id);
    mascotasActuales = mascotasActuales.filter((item) => String(item.id) !== String(mascota.id));
    renderizarMascotas();
    mostrarAviso(`${nombre} se desactivó correctamente.`);
  } catch (error) {
    mostrarAviso(error?.error || error?.message || "No se pudo desactivar la mascota.", "error");
  }
}

/** Carga el listado desde el servidor y pinta tarjetas o estados vacíos/error sin datos de prueba. */
async function cargarListado() {
  const contenedor = document.querySelector("#mascotas-lista");
  contenedor.setAttribute("aria-busy", "true");
  contenedor.replaceChildren(crearElemento("div", { clase: "mascotas-cargando mascotas-cargando--tarjeta" }), crearElemento("div", { clase: "mascotas-cargando mascotas-cargando--tarjeta" }));
  try {
    const respuesta = await api.mascotas.listar({ activa: true });
    mascotasActuales = obtenerLista(respuesta).filter((mascota) => mascota.activa === undefined || mascota.activa === true || Number(mascota.activa) === 1);
    contenedor.setAttribute("aria-busy", "false");
    renderizarMascotas();
  } catch (error) {
    contenedor.setAttribute("aria-busy", "false");
    const bloque = crearElemento("div", { clase: "mascotas-error", atributos: { role: "alert" } });
    bloque.append(crearElemento("p", { texto: error?.error || error?.message || "No se pudieron cargar tus mascotas." }));
    const reintentar = crearElemento("button", { clase: "boton boton--secundario", texto: "Reintentar", atributos: { type: "button" } });
    reintentar.addEventListener("click", cargarListado, { once: true });
    bloque.append(reintentar);
    contenedor.replaceChildren(bloque);
  }
}

/** Inicializa los controles del modal una sola vez por página. */
function conectarFormulario() {
  const formulario = document.querySelector("#formulario-mascota");
  formulario.addEventListener("submit", enviarFormularioMascota);
  for (const boton of document.querySelectorAll("[data-cerrar-modal]")) boton.addEventListener("click", () => document.querySelector("#modal-mascota").close());
  const dialogo = document.querySelector("#modal-mascota");
  dialogo.addEventListener("click", (evento) => { if (evento.target === dialogo) dialogo.close(); });

  document.querySelector("#mascota-especie").addEventListener("change", async (evento) => {
    try { await cargarRazas(evento.currentTarget.value); }
    catch { mostrarMensajeModal("No se pudieron cargar las razas de esta especie."); }
  });

  const inputFoto = document.querySelector("#mascota-foto");
  inputFoto.addEventListener("change", () => {
    const archivo = inputFoto.files[0];
    const error = document.querySelector('[data-error="foto"]');
    error.textContent = "";
    inputFoto.removeAttribute("aria-invalid");
    if (!archivo) return;
    if (!TIPOS_FOTO.has(archivo.type) || archivo.size > MAXIMO_FOTO_BYTES) {
      inputFoto.value = "";
      error.textContent = !TIPOS_FOTO.has(archivo.type) ? "Selecciona una imagen JPG, PNG o WebP." : "La fotografía no puede superar los 4 MB.";
      inputFoto.setAttribute("aria-invalid", "true");
      return;
    }
    quitarFotoActual = false;
    mostrarVistaFoto(archivo, true);
    document.querySelector("#quitar-foto").hidden = false;
  });

  document.querySelector("#quitar-foto").addEventListener("click", () => {
    inputFoto.value = "";
      quitarFotoActual = Boolean(mascotaEnEdicion?.foto_url);
    mostrarVistaFoto(null);
    document.querySelector("#quitar-foto").hidden = true;
  });

  dialogo.addEventListener("close", () => {
    if (fotoUrlTemporal) URL.revokeObjectURL(fotoUrlTemporal);
    fotoUrlTemporal = null;
    });
}

/** Ejecuta la protección de usuario y construye la sección usando el layout compartido. */
async function iniciar() {
  const raiz = document.querySelector("#app");
  if (!raiz) return;
  try {
    sesionActual = await protegerPagina({ roles: ["usuario"], loginUrl: RUTAS.login, inicioUrl: RUTAS.administrador });
    if (!sesionActual) return;
    layoutActual = montarLayout({ contenedor: raiz, sesion: sesionActual, titulo: "Mis mascotas", paginaActual: "/mascotas.html" });
    const regiones = construirPagina(layoutActual.contenido);
    layoutActual.elemento.querySelector(".app-topbar__busqueda input")?.addEventListener("input", debounce((evento) => {
      regiones.campo.value = evento.target.value;
      terminoActual = evento.target.value.trim().toLocaleLowerCase("es-CO");
      renderizarMascotas();
    }, 160));
    conectarFormulario();
    await Promise.all([
      cargarEspecies().catch((error) => mostrarAviso(error?.error || error?.message || "No se pudo cargar el catálogo de especies; el formulario puede no estar disponible.", "error")),
      cargarListado()
    ]);
    const editarId = new URLSearchParams(window.location.search).get("editar");
    if (editarId) {
      const mascota = mascotasActuales.find((item) => String(item.id) === String(editarId));
      if (mascota) await abrirModalMascota("editar", mascota);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    raiz.setAttribute("aria-busy", "false");
    raiz.replaceChildren(crearElemento("main", { clase: "mascotas-estado", texto: "No fue posible preparar la sección. Intenta recargar la página." }));
  }
}

iniciar();
