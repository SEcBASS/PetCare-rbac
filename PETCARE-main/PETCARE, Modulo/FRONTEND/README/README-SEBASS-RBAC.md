# Mi aporte a PetCare: autenticación y roles

Hola. Soy SEBASS y trabajé en conectar el backend de PetCare con MariaDB e incorporar un sistema sencillo de roles. La idea fue que el proyecto pudiera distinguir entre personas comunes y administradores sin volver a escribir la autorización en cada pantalla del frontend.

Este trabajo corresponde al estado del proyecto al 21 de noviembre de 2026.

## Tecnologías utilizadas

- **Python 3.14** como lenguaje principal del backend.
- **FastAPI** para la creación de la API REST y sus rutas protegidas.
- **Uvicorn** como servidor ASGI durante el desarrollo.
- **MariaDB** incluida en XAMPP como motor de base de datos.
- **mysql-connector-python** para la comunicación entre Python y MariaDB.
- **Pydantic** para validar los datos recibidos por la API.
- **bcrypt** para almacenar y verificar contraseñas mediante hashes seguros.
- **PyJWT** para firmar las sesiones emitidas por el servidor.
- **python-dotenv** para cargar variables de configuración desde un archivo `.env`.
- **XAMPP** para ejecutar Apache y MariaDB en Windows.
- **HTML, CSS y JavaScript ES Modules** en la parte existente del frontend.

## Cambios realizados

### Backend

Reemplacé la implementación inicial incompleta de `main.py` por una API funcional con:

- conexión configurable a MariaDB mediante variables de entorno;
- pool de conexiones para reutilizar recursos;
- registro de usuarios públicos con rol `usuario`;
- inicio de sesión con validación de correo y contraseña;
- actualización de la fecha de último acceso;
- consulta de la sesión actual;
- cierre de sesión;
- manejo de errores en formato `{ "error": "...", "campos": {} }`;
- protección de rutas administrativas;
- validación del origen de las solicitudes modificadoras.

### Sistema RBAC

El control de acceso se basa en el campo `usuarios.rol` del esquema MySQL. Hay dos roles claros:

- `usuario`: puede iniciar sesión y acceder a las funciones normales de su cuenta.
- `administrador`: además de las funciones normales, puede entrar a las rutas administrativas.

No decidí crear un sistema con roles más complejos porque ahora mismo PetCare solo necesita separar estas dos responsabilidades. El registro público siempre asigna `usuario`. El valor de administrador no puede enviarse desde el frontend ni definirse libremente durante el registro.

Dejé dos niveles de protección:

- un middleware para las rutas que comienzan con `/api/admin`;
- una dependencia reutilizable `require_roles(...)` para proteger rutas individuales.

En ambos casos, el servidor consulta el usuario y su rol desde MariaDB. El navegador no puede concederse permisos modificando datos locales.

### Sesiones

Después de validar las credenciales, el servidor crea una cookie firmada que contiene únicamente información mínima de sesión.

La cookie utiliza:

- firma con JWT;
- atributo `HttpOnly`;
- atributo `SameSite=Lax`;
- expiración configurable;
- acceso a datos de usuario validado nuevamente desde la base de datos;
- secreto almacenado fuera del código mediante `SESSION_SECRET`.

Las rutas protegidas vuelven a comprobar que el usuario existe y que está activo antes de autorizar la operación.

### Base de datos

Preparé un proceso de inicialización que:

- crea la base de datos `petcare` si no existe;
- importa el esquema desde `petcare.sql`;
- crea una cuenta administrativa de desarrollo;
- crea una cuenta de usuario de desarrollo;
- usa hashes bcrypt para las contraseñas;
- evita duplicar cuentas si se ejecuta nuevamente.

El esquema existente contiene el campo `usuarios.rol` como enumeración con los valores `administrador` y `usuario`, por lo que se mantuvo esa estructura para evitar cambios innecesarios.

### XAMPP y MariaDB

La instalación prevista para Windows usa el paquete de MariaDB que incluye XAMPP. Apache sirve el frontend y MariaDB permanece disponible en el puerto `3306`. XAMPP permite administrar las tablas desde phpMyAdmin y mantiene una configuración sencilla para las pruebas locales.

## Rutas principales

Estas fueron las rutas que dejé listas:

- `POST /api/auth/registro`: es pública y crea usuarios normales.
- `POST /api/auth/login`: recibe las credenciales y abre la sesión.
- `GET /api/sesion`: devuelve los datos del usuario autenticado.
- `DELETE /api/sesion`: elimina la sesión actual.
- `GET /api/admin/resumen`: solo puede ejecutarse con el rol administrador.

## Ejemplo de protección

```python
@app.get("/api/admin/resumen")
async def resumen_administracion(
    usuario: dict = Depends(require_roles("administrador"))
):
    return {
        "usuario": usuario_publico(usuario),
        "mensaje": "Acceso administrativo permitido",
    }
```

La dependencia impide el acceso antes de ejecutar el cuerpo de la ruta si el usuario no tiene el rol requerido.

## Archivos incorporados o modificados

- `BACKEND/main.py`: API FastAPI, middleware, dependencias RBAC y rutas de autenticación.
- `BACKEND/setup_database.py`: inicialización de MariaDB y creación de cuentas iniciales.
- `BACKEND/requirements.txt`: dependencias de Python.
- `BACKEND/.env.example`: variables de configuración y cuentas de desarrollo.
- `BACKEND/README.md`: instrucciones rápidas de ejecución del backend.
- `DATABASE/petcare.sql`: esquema utilizado para crear la base de datos.

## Configuración de desarrollo

Ejemplo de variables necesarias:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=petcare
SESSION_SECRET=cambia-esta-clave
CORS_ORIGINS=http://localhost
COOKIE_SECURE=false
```

El secreto de sesión debe reemplazarse por un valor largo y aleatorio antes de usar el proyecto fuera del entorno de desarrollo.

## Ejecución en Windows con XAMPP

Primero inicia Apache y MySQL desde el panel de XAMPP. Después prepara la base desde phpMyAdmin o ejecuta `python setup_database.py` con los datos de `.env`.

Desde PowerShell, dentro de la carpeta del backend:

```powershell
python -m pip install -r requirements.txt
python setup_database.py
uvicorn main:app --host 127.0.0.1 --port 8001
```

El frontend se sirve por Apache desde `http://localhost/.../FRONTEND/HTML/`, y FastAPI permanece disponible en `http://127.0.0.1:8001`. No es necesario usar Docker.

## Cuentas para probar el proyecto

Para las pruebas locales dejé dos cuentas:

- Administrador: `admin@petcare.com` con contraseña `Admin123!`.
- Usuario: `usuario@petcare.com` con contraseña `Usuario123!`.

Son solo credenciales de desarrollo. Antes de publicar PetCare deben cambiarse o eliminarse.

## Pruebas realizadas

Probé el flujo completo con ambos roles:

- compilación sintáctica de los archivos Python;
- carga correcta de la aplicación FastAPI;
- registro de las rutas de autenticación y administración;
- conexión de FastAPI con MariaDB;
- importación del esquema `petcare.sql`;
- inicio de sesión como administrador: respuesta `200`;
- acceso administrativo como administrador: respuesta `200`;
- inicio de sesión como usuario: respuesta `200`;
- rechazo de la ruta administrativa a un usuario normal: respuesta `403`.

Las pruebas confirmaron que el backend distingue correctamente ambos roles y que una sesión de usuario no puede acceder a recursos reservados para administradores.

## Buenas prácticas aplicadas

- Las contraseñas no se almacenan en texto plano.
- El rol no se acepta como dato público durante el registro.
- Las rutas protegen autorización en el servidor y no dependen únicamente del frontend.
- Los permisos se verifican consultando el estado actual del usuario.
- La sesión utiliza una cookie `HttpOnly`.
- Los errores HTTP usan respuestas JSON consistentes.
- Los secretos se separan del código mediante variables de entorno.
- Los usuarios inactivos pierden acceso aunque exista una cookie anterior.

## Pendientes

La implementación actual cubre autenticación, conexión a la base de datos y RBAC básico. Quedan fuera del alcance desarrollado:

- recuperación de contraseña;
- autenticación mediante Google o Facebook;
- persistencia de sesiones en una tabla de base de datos;
- bloqueo temporal ante intentos repetidos de inicio de sesión;
- auditoría detallada de acciones administrativas;
- configuración completa de despliegue HTTPS.

## Cierre

Con esta integración ya tenemos una base real sobre la cual seguir construyendo PetCare. Ahora el servidor puede reconocer a una persona, confirmar su sesión y decidir qué puede hacer según su rol. Lo importante es que esa decisión ocurre en el backend y no solamente en los botones o páginas del navegador.
