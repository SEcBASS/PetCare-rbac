/* Comportamientos de la landing pública. No realiza peticiones a la API. */

/**
 * Inicializa el menú compacto para pantallas pequeñas.
 * El estado se refleja en aria-expanded y el menú se cierra al navegar,
 * pulsar Escape o seleccionar un enlace fuera del propio botón.
 */
function inicializarMenuMovil() {
  const boton = document.querySelector(".menu-movil");
  const navegacion = document.querySelector("#navegacion-principal");

  if (!boton || !navegacion) {
    return;
  }

  const consultaMovil = window.matchMedia("(max-width: 800px)");

  /** Sincroniza la visibilidad del menú con su estado accesible. */
  function establecerMenu(abierto) {
    const estado = Boolean(abierto && consultaMovil.matches);

    boton.setAttribute("aria-expanded", String(estado));
    boton.setAttribute("aria-label", estado ? "Cerrar menú" : "Abrir menú");
    navegacion.dataset.abierta = String(estado);
  }

  boton.addEventListener("click", () => {
    const abierto = boton.getAttribute("aria-expanded") === "true";
    establecerMenu(!abierto);
  });

  navegacion.addEventListener("click", (evento) => {
    const enlace = evento.target.closest("a");
    if (enlace) {
      establecerMenu(false);
    }
  });

  document.addEventListener("click", (evento) => {
    if (!consultaMovil.matches || boton.getAttribute("aria-expanded") !== "true") {
      return;
    }

    if (!navegacion.contains(evento.target) && !boton.contains(evento.target)) {
      establecerMenu(false);
    }
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && boton.getAttribute("aria-expanded") === "true") {
      establecerMenu(false);
      boton.focus();
    }
  });

  consultaMovil.addEventListener("change", () => {
    establecerMenu(false);
  });
}

/**
 * Activa apariciones suaves al entrar las secciones en el área visible.
 * Si el navegador no ofrece IntersectionObserver o el usuario ha reducido
 * el movimiento, los elementos se dejan visibles desde el inicio.
 */
function inicializarAnimacionesScroll() {
  const elementos = document.querySelectorAll("[data-revelar]");
  const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (elementos.length === 0 || movimientoReducido || !("IntersectionObserver" in window)) {
    return;
  }

  elementos.forEach((elemento) => {
    elemento.classList.add("revelar--pendiente");
  });

  const observador = new IntersectionObserver((entradas, instancia) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) {
        return;
      }

      entrada.target.classList.remove("revelar--pendiente");
      entrada.target.classList.add("revelar--visible");
      instancia.unobserve(entrada.target);
    });
  }, {
    root: null,
    rootMargin: "0px 0px -7% 0px",
    threshold: 0.12
  });

  elementos.forEach((elemento) => observador.observe(elemento));
}

/**
 * Presenta un espacio de reemplazo accesible cuando aún no existe la imagen
 * opcional de img/mascota-hero.webp. La imagen real se carga desde la carpeta img.
 */
function inicializarImagenHero() {
  const imagen = document.querySelector(".hero__imagen-mascota");
  const alternativa = document.querySelector(".hero__imagen-alternativa");

  if (!imagen || !alternativa) {
    return;
  }

  function mostrarAlternativa() {
    imagen.hidden = true;
    alternativa.hidden = false;
  }

  imagen.addEventListener("error", mostrarAlternativa, { once: true });

  if (imagen.complete && imagen.naturalWidth === 0) {
    mostrarAlternativa();
  }
}

/* Inicialización al evaluar el módulo: los scripts type="module" se ejecutan
   después de analizar el documento, por lo que los elementos ya están disponibles. */
inicializarMenuMovil();
inicializarAnimacionesScroll();
inicializarImagenHero();
