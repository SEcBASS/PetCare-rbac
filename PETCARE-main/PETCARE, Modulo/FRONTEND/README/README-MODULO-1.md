# PetCare — Módulo 1: Landing pública

Este módulo agrega exclusivamente la página pública de presentación de PetCare. Conserva intactos los archivos compartidos del Módulo 0.

## Archivos agregados

```text
index.html
css/landing.css
js/landing.js
img/mascota-hero.webp   # archivo de imagen que debe proporcionar el proyecto
```

## Imagen del hero

Coloca la imagen de la mascota en `img/mascota-hero.webp`. Puedes usar otro nombre o formato, pero en ese caso actualiza el atributo `src` de `.hero__imagen-mascota` en `index.html`.

Mientras el archivo no exista, la página muestra un espacio alternativo que indica la ruta que debes completar. No se incluye una imagen de muestra.

## Navegación prevista

- `login.html`: destino de «Iniciar sesión».
- `registro.html`: destino de «Crear cuenta», «Comenzar ahora» y «Empezar gratis».
- `centro-ayuda.html`, `contacto.html` y `privacidad.html`: destinos informativos previstos para enlaces del footer.
- Los enlaces de navegación internos apuntan a secciones de `index.html`.

Las páginas enlazadas que no pertenecen a este módulo no se crean aquí.

## API y backend

Esta landing no consulta datos privados ni realiza peticiones a la API. No requiere endpoints nuevos. El registro y el inicio de sesión se implementarán en sus respectivos módulos y se conectarán al cliente compartido `js/api.js`.

## Comportamientos incluidos

- Menú hamburguesa responsive con atributos ARIA, cierre por Escape, clic exterior y selección de enlace.
- Animaciones de entrada al desplazarse usando `IntersectionObserver`.
- Respeto de `prefers-reduced-motion` y degradación segura cuando no existe `IntersectionObserver`.
- Alternativa visual cuando todavía no se ha colocado la imagen del hero.
- Sin estadísticas, testimonios, precios, tienda, carrito ni pagos.
