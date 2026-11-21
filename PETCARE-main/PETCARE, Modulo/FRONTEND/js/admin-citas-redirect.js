/** Conserva parámetros de enlaces antiguos y redirige al formulario canónico de citas. */
const destino = new URL("/admin-cita-nueva.html", window.location.origin);
const parametros = new URLSearchParams(window.location.search);
for (const [clave, valor] of parametros) destino.searchParams.set(clave, valor);
window.location.replace(destino.href);
