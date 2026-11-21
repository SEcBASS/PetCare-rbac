/**
 * Controlador de las páginas públicas de autenticación.
 * La comunicación con el servidor siempre se realiza mediante js/api.js.
 * Las comprobaciones del navegador mejoran la experiencia, pero no sustituyen
 * la autenticación, validación ni autorización que debe realizar el backend.
 */

import api, { ApiError } from "./api.js";

const pagina = document.body.dataset.authPage;
const selectoresErrores = "[data-error-for]";

/** Devuelve un nodo del documento sin depender de identificadores globales. */
function obtenerElemento(selector, raiz = document) {
  return raiz.querySelector(selector);
}

/** Convierte los errores de campo del servidor en mensajes de texto seguros. */
function normalizarMensajeCampo(valor) {
  if (Array.isArray(valor)) return valor.map(String).filter(Boolean).join(" ");
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object" && typeof valor.mensaje === "string") return valor.mensaje;
  return "Revisa este campo.";
}

/** Relaciona posibles nombres devueltos por el servidor con los controles del formulario. */
function normalizarNombreCampo(nombre) {
  const equivalencias = {
    email: "correo",
    nombre: "nombre_completo",
    password: "contrasena",
    password_confirmation: "confirmar_contrasena",
    confirmar_password: "confirmar_contrasena",
    terms: "acepta_terminos",
    acepta_terminos: "acepta_terminos",
    terminos_aceptados: "acepta_terminos"
  };
  return equivalencias[nombre] || nombre;
}

/** Muestra un aviso global con texto plano y controla su visibilidad. */
function mostrarMensaje(selector, mensaje) {
  const elemento = obtenerElemento(selector);
  if (!elemento) return;
  elemento.textContent = mensaje || "No fue posible completar la solicitud.";
  elemento.hidden = false;
}

/** Oculta y vacía un aviso global. */
function limpiarMensaje(selector) {
  const elemento = obtenerElemento(selector);
  if (!elemento) return;
  elemento.textContent = "";
  elemento.hidden = true;
}

/** Borra los errores de validación de un formulario y restablece aria-invalid. */
function limpiarErroresFormulario(formulario) {
  formulario.querySelectorAll(selectoresErrores).forEach((elemento) => {
    elemento.textContent = "";
  });
  formulario.querySelectorAll("[aria-invalid='true']").forEach((campo) => {
    campo.removeAttribute("aria-invalid");
  });
}

/** Muestra un error junto al campo correspondiente y devuelve si pudo asociarlo. */
function mostrarErrorCampo(formulario, nombre, mensaje) {
  const campo = formulario.elements.namedItem(nombre);
  const elementoError = formulario.querySelector(`[data-error-for="${CSS.escape(nombre)}"]`);
  if (campo && "setAttribute" in campo) campo.setAttribute("aria-invalid", "true");
  if (elementoError) {
    elementoError.textContent = mensaje;
    return true;
  }
  return false;
}

/** Traduce el objeto campos del error API y muestra el mensaje general del servidor. */
function presentarErrorServidor(error, formulario, selectorAviso) {
  limpiarErroresFormulario(formulario);
  const campos = error instanceof ApiError ? error.campos : error?.campos;
  if (campos && typeof campos === "object") {
    Object.entries(campos).forEach(([nombreOriginal, valor]) => {
      const nombre = normalizarNombreCampo(nombreOriginal);
      mostrarErrorCampo(formulario, nombre, normalizarMensajeCampo(valor));
    });
  }
  const mensaje = error instanceof ApiError
    ? error.message
    : (typeof error?.message === "string" ? error.message : "No fue posible completar la solicitud.");
  mostrarMensaje(selectorAviso, mensaje);
}

/** Comprueba los campos requeridos, el formato del correo y la longitud mínima. */
function validarFormulario(formulario) {
  limpiarErroresFormulario(formulario);
  let primerCampoInvalido = null;

  const campos = Array.from(formulario.elements).filter((elemento) =>
    elemento instanceof HTMLInputElement && !elemento.disabled && elemento.type !== "hidden" && elemento.name
  );

  campos.forEach((campo) => {
    let mensaje = "";
    const valor = campo.type === "checkbox" ? campo.checked : campo.value.trim();

    if (campo.required && !valor) {
      mensaje = campo.type === "checkbox" ? "Debes aceptar esta condición para continuar." : "Este campo es obligatorio.";
    } else if (campo.type === "email" && valor && !campo.validity.valid) {
      mensaje = "Escribe un correo electrónico válido.";
    } else if (campo.minLength > 0 && campo.value && campo.value.length < campo.minLength) {
      mensaje = `Escribe al menos ${campo.minLength} caracteres.`;
    }

    if (mensaje) {
      mostrarErrorCampo(formulario, campo.name, mensaje);
      if (!primerCampoInvalido) primerCampoInvalido = campo;
    }
  });

  const contrasena = formulario.elements.namedItem("contrasena");
  const confirmacion = formulario.elements.namedItem("confirmar_contrasena");
  if (contrasena && confirmacion && contrasena.value && confirmacion.value && contrasena.value !== confirmacion.value) {
    mostrarErrorCampo(formulario, "confirmar_contrasena", "Las contraseñas no coinciden.");
    primerCampoInvalido ||= confirmacion;
  }

  if (primerCampoInvalido) {
    primerCampoInvalido.focus();
    return false;
  }
  return true;
}

/** Bloquea el botón durante la petición para evitar envíos duplicados. */
function cambiarEstadoEnvio(boton, cargando, textoCargando = "Procesando…") {
  if (!boton) return;
  boton.disabled = cargando;
  if (cargando) {
    boton.setAttribute("aria-busy", "true");
  } else {
    boton.removeAttribute("aria-busy");
  }
  const texto = boton.querySelector(".auth-boton__texto");
  if (texto) texto.textContent = cargando ? textoCargando : (boton.dataset.submitLabel || texto.textContent);
}

/** Redirige según el rol confirmado por el servidor después de crear la sesión. */
function redirigirPorRol(respuesta) {
  const usuario = respuesta?.usuario;
  if (!usuario || typeof usuario.rol !== "string") {
    throw new Error("El servidor no devolvió la información de usuario necesaria para continuar.");
  }

  const rol = usuario.rol.toLocaleLowerCase("es-CO");
  if (rol === "usuario") {
    window.location.assign("/inicio.html");
    return;
  }
  if (rol === "administrador") {
    window.location.assign("/admin-usuarios.html");
    return;
  }
  throw new Error("La cuenta tiene un rol que no está reconocido por PetCare.");
}

/** Activa el control accesible para mostrar u ocultar un campo de contraseña. */
function configurarVisibilidadContrasena() {
  document.querySelectorAll("[data-toggle-password]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const campo = document.getElementById(boton.dataset.togglePassword);
      if (!campo) return;
      const mostrar = campo.type === "password";
      campo.type = mostrar ? "text" : "password";
      boton.setAttribute("aria-pressed", String(mostrar));
      boton.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });
}

/** Borra el error global y el mensaje del campo mientras la persona corrige el formulario. */
function configurarLimpiezaDeErrores() {
  document.querySelectorAll("form").forEach((formulario) => {
    formulario.addEventListener("input", (evento) => {
      const campo = evento.target;
      if (!(campo instanceof HTMLInputElement)) return;
      campo.removeAttribute("aria-invalid");
      const error = formulario.querySelector(`[data-error-for="${CSS.escape(campo.name)}"]`);
      if (error) error.textContent = "";
      const avisos = formulario.closest("section, .auth-formulario-contenedor")?.querySelectorAll(".auth-mensaje[role='alert']") || [];
      avisos.forEach((aviso) => {
        aviso.textContent = "";
        aviso.hidden = true;
      });
    });
  });
}

/** Procesa el inicio de sesión con correo y contraseña. */
function configurarLogin() {
  const formulario = obtenerElemento("#form-login");
  if (!formulario) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector("button[type='submit']");
    limpiarMensaje("#mensaje-global");
    if (boton?.disabled || !validarFormulario(formulario)) return;

    cambiarEstadoEnvio(boton, true);
    try {
      const respuesta = await api.auth.iniciar({
        correo: formulario.elements.namedItem("correo").value.trim(),
        contrasena: formulario.elements.namedItem("contrasena").value,
        recordarme: formulario.elements.namedItem("recordarme").checked
      });
      redirigirPorRol(respuesta);
    } catch (error) {
      presentarErrorServidor(error, formulario, "#mensaje-global");
      cambiarEstadoEnvio(boton, false);
    }
  });

  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get("registro") === "exitoso") {
    mostrarMensaje("#mensaje-registro", "Tu cuenta se creó correctamente. Inicia sesión para continuar.");
  }
}

/** Procesa la creación de cuenta. El rol nunca se envía desde el navegador. */
function configurarRegistro() {
  const formulario = obtenerElemento("#form-registro");
  if (!formulario) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector("button[type='submit']");
    limpiarMensaje("#mensaje-global");
    limpiarMensaje("#mensaje-exito");
    if (boton?.disabled || !validarFormulario(formulario)) return;

    cambiarEstadoEnvio(boton, true, "Creando cuenta…");
    try {
      const respuesta = await api.auth.registrar({
        nombre_completo: formulario.elements.namedItem("nombre_completo").value.trim(),
        correo: formulario.elements.namedItem("correo").value.trim(),
        contrasena: formulario.elements.namedItem("contrasena").value,
        acepta_terminos: formulario.elements.namedItem("acepta_terminos").checked
      });
      formulario.reset();
      limpiarErroresFormulario(formulario);
      mostrarMensaje("#mensaje-exito", respuesta?.mensaje || "Tu cuenta se creó correctamente. Ya puedes iniciar sesión.");
      const enlaceAcceso = document.createElement("a");
      enlaceAcceso.href = "/login.html";
      enlaceAcceso.className = "auth-enlace auth-enlace--fuerte";
      enlaceAcceso.textContent = " Ir a iniciar sesión";
      obtenerElemento("#mensaje-exito").append(enlaceAcceso);
    } catch (error) {
      presentarErrorServidor(error, formulario, "#mensaje-global");
    } finally {
      cambiarEstadoEnvio(boton, false);
    }
  });
}

/** Envía una solicitud de recuperación sin revelar en la interfaz si el correo está registrado. */
function configurarSolicitudRecuperacion() {
  const formulario = obtenerElemento("#form-recuperar");
  if (!formulario) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector("button[type='submit']");
    limpiarMensaje("#mensaje-global");
    limpiarMensaje("#mensaje-solicitud");
    if (boton?.disabled || !validarFormulario(formulario)) return;

    cambiarEstadoEnvio(boton, true, "Enviando…");
    try {
      const respuesta = await api.auth.solicitarRecuperacion({
        correo: formulario.elements.namedItem("correo").value.trim()
      });
      formulario.reset();
      mostrarMensaje("#mensaje-solicitud", respuesta?.mensaje || "Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer la contraseña.");
    } catch (error) {
      presentarErrorServidor(error, formulario, "#mensaje-global");
    } finally {
      cambiarEstadoEnvio(boton, false);
    }
  });
}

/** Lee el token del enlace una sola vez y lo conserva únicamente en memoria durante este flujo. */
function configurarRestablecimiento() {
  const formulario = obtenerElemento("#form-restablecer");
  if (!formulario) return;

  const parametros = new URLSearchParams(window.location.search);
  const token = parametros.get("token");
  const vistaSolicitud = obtenerElemento("#vista-solicitar");
  const vistaRestablecer = obtenerElemento("#vista-restablecer");

  if (!token) {
    vistaSolicitud.hidden = false;
    vistaRestablecer.hidden = true;
    return;
  }

  vistaSolicitud.hidden = true;
  vistaRestablecer.hidden = false;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector("button[type='submit']");
    limpiarMensaje("#mensaje-restablecer-error");
    limpiarMensaje("#mensaje-restablecer-exito");
    if (boton?.disabled || !validarFormulario(formulario)) return;

    cambiarEstadoEnvio(boton, true, "Guardando…");
    try {
      const respuesta = await api.auth.restablecer({
        token,
        contrasena: formulario.elements.namedItem("contrasena").value
      });
      formulario.reset();
      limpiarErroresFormulario(formulario);
      mostrarMensaje("#mensaje-restablecer-exito", respuesta?.mensaje || "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      presentarErrorServidor(error, formulario, "#mensaje-restablecer-error");
    } finally {
      cambiarEstadoEnvio(boton, false);
    }
  });
}

/** Convierte el código temporal de Google Identity Services en una sesión PetCare. */
function obtenerCodigoGoogle() {
  return new Promise((resolve, reject) => {
    const clienteId = document.querySelector('meta[name="google-client-id"]')?.content.trim();
    if (!clienteId) {
      reject(new Error("El inicio de sesión con Google todavía no está configurado. Añade el ID de cliente de Google en login.html."));
      return;
    }
    if (!window.google?.accounts?.oauth2?.initCodeClient) {
      reject(new Error("No se pudo cargar el servicio de Google. Comprueba tu conexión e inténtalo de nuevo."));
      return;
    }

    let resuelta = false;
    const temporizador = window.setTimeout(() => {
      if (!resuelta) reject(new Error("La ventana de Google no terminó el proceso. Inténtalo de nuevo."));
    }, 90000);
    const finalizar = (funcion, valor) => {
      if (resuelta) return;
      resuelta = true;
      window.clearTimeout(temporizador);
      funcion(valor);
    };

    try {
      const clienteCodigo = window.google.accounts.oauth2.initCodeClient({
        client_id: clienteId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (respuesta) => {
          if (respuesta?.error || !respuesta?.code) {
            finalizar(reject, new Error(respuesta?.error_description || "No se pudo completar el acceso con Google."));
            return;
          }
          finalizar(resolve, respuesta.code);
        },
        error_callback: (error) => finalizar(reject, new Error(error?.message || "No se pudo abrir la ventana de Google."))
      });
      clienteCodigo.requestCode();
    } catch {
      finalizar(reject, new Error("No se pudo iniciar la autenticación con Google."));
    }
  });
}

/** Solicita el token de acceso temporal a través del SDK oficial de Facebook Login. */
function obtenerTokenFacebook() {
  return new Promise((resolve, reject) => {
    const appId = document.querySelector('meta[name="facebook-app-id"]')?.content.trim();
    if (!appId) {
      reject(new Error("El inicio de sesión con Facebook todavía no está configurado. Añade el ID de aplicación de Facebook en login.html."));
      return;
    }
    if (!window.FB) {
      reject(new Error("No se pudo cargar el servicio de Facebook. Comprueba tu conexión e inténtalo de nuevo."));
      return;
    }

    try {
      window.FB.login((respuesta) => {
        const token = respuesta?.authResponse?.accessToken;
        if (!token) {
          reject(new Error("No se completó la autorización con Facebook."));
          return;
        }
        resolve(token);
      }, { scope: "email,public_profile", return_scopes: true });
    } catch {
      reject(new Error("No se pudo iniciar la autenticación con Facebook."));
    }
  });
}

/** Inicializa el SDK de Facebook cuando se dispone del identificador público de la aplicación. */
function prepararSdkFacebook() {
  const appId = document.querySelector('meta[name="facebook-app-id"]')?.content.trim();
  if (!appId) return;

  const inicializar = () => {
    if (!window.FB) return;
    window.FB.init({ appId, cookie: true, xfbml: false, version: "v26.0" });
  };

  if (window.FB) {
    inicializar();
  } else {
    window.fbAsyncInit = inicializar;
  }
}

/** Conecta los botones sociales a sus SDK y después a los endpoints propios de PetCare. */
function configurarLoginSocial() {
  const botonGoogle = obtenerElemento("#google-login");
  const botonFacebook = obtenerElemento("#facebook-login");
  if (!botonGoogle && !botonFacebook) return;

  prepararSdkFacebook();

  const iniciarProveedor = async (boton, proveedor, obtenerCredencial, enviarCredencial) => {
    if (!boton || boton.disabled) return;
    limpiarMensaje("#mensaje-global");
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    try {
      const credencial = await obtenerCredencial();
      const respuesta = await enviarCredencial(credencial);
      redirigirPorRol(respuesta);
    } catch (error) {
      mostrarMensaje("#mensaje-global", error instanceof ApiError ? error.message : (error?.message || `No fue posible iniciar sesión con ${proveedor}.`));
      boton.disabled = false;
      boton.removeAttribute("aria-busy");
    }
  };

  botonGoogle?.addEventListener("click", () => iniciarProveedor(
    botonGoogle,
    "Google",
    obtenerCodigoGoogle,
    (code) => api.auth.iniciarGoogle({ code })
  ));

  botonFacebook?.addEventListener("click", () => iniciarProveedor(
    botonFacebook,
    "Facebook",
    obtenerTokenFacebook,
    (accessToken) => api.auth.iniciarFacebook({ access_token: accessToken })
  ));
}

/** Inicia únicamente el controlador que corresponde a la página abierta. */
function iniciarAutenticacion() {
  configurarVisibilidadContrasena();
  configurarLimpiezaDeErrores();

  if (pagina === "login") {
    configurarLogin();
    configurarLoginSocial();
    return;
  }
  if (pagina === "registro") {
    configurarRegistro();
    return;
  }
  if (pagina === "recuperar") {
    configurarSolicitudRecuperacion();
    configurarRestablecimiento();
  }
}

iniciarAutenticacion();
