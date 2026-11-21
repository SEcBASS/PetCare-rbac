# PetCare — Proyecto acumulado hasta el Módulo 6

Este directorio contiene los módulos 0 a 6 del frontend PetCare:

- Módulo 0: variables, estilos base, componentes, cliente API, sesión, layout, utilidades y páginas 403/404.
- Módulo 1: landing pública.
- Módulo 2: autenticación, registro y recuperación.
- Módulo 3: Inicio del usuario.
- Módulo 4: listado y perfil de mascotas.
- Módulo 5: consulta de citas en lista y calendario mensual.
- Módulo 6: carnet de vacunas en modo de solo lectura.

## Ejecución

Sirve la carpeta desde un servidor HTTP que permita módulos ES. Las peticiones del frontend usan rutas relativas `/api` y cookies de sesión del mismo origen. No abras las páginas directamente mediante `file://`.

## Documentación

- `README-MODULO-5.md`: contratos de consulta de citas.
- `README-MODULO-6.md`: contrato del carnet de vacunación y mapeo de estados.

## Importante

El frontend no sustituye la API. El servidor FastAPI debe autenticar y autorizar cada petición, validar los parámetros y consultar exclusivamente los registros que pertenecen al usuario autenticado. El usuario no agenda citas ni registra/modifica vacunas; esas acciones corresponden al administrador.
