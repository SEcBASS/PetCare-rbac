# Mi aporte a PetCare: autenticación y roles

Wenasss. Soy SEBASS y trabajé en conectar el backend de PetCare con MariaDB e incorporar un sistema sencillo de roles. La idea fue que el proyecto pudiera distinguir entre personas comunes y administradores sin volver a escribir la autorización en cada pantalla del frontend.

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

## Cómo preparar PetCare una sola vez

Cuando otra persona o una instalación nueva vaya a usar el proyecto, la configuración debe quedar así:

1. Instalar XAMPP e iniciar Apache y MySQL.
2. Abrir `http://localhost/phpmyadmin`.
3. Crear una base llamada `petcare`.
4. Seleccionar esa base y importar `DATABASE/petcare.sql`.
5. Copiar `BACKEND/.env.example` como `BACKEND/.env`.
6. Confirmar los datos de XAMPP dentro de `.env`: normalmente el usuario es `root`, la contraseña está vacía y el puerto es `3306`.
7. Crear el entorno virtual e instalar las dependencias desde la carpeta `BACKEND`:

pero igual es uuuuuuultraobvio supongo.....

```powershell

eto es para el entorno virtuañl
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python setup_database.py
```

El script `setup_database.py` no reemplaza datos existentes ni vuelve a crear cuentas duplicadas. También puede ejecutar la importación cuando no exista todavía la base `petcare`.

## Para abrir el sitio en Windows

Cada vez que quieras usar PetCare, solo necesitas iniciar XAMPP y FastAPI:

1. En el panel de XAMPP, inicia **Apache** y **MySQL**.
2. Desde PowerShell, entra a `BACKEND` y activa el entorno:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8001
```

3. Abre el frontend por Apache desde `http://localhost/.../FRONTEND/HTML/login.html` o coloca la carpeta del proyecto dentro de `htdocs`.
4. Inicia sesión con la cuenta registrada o con una cuenta de prueba.

No hace falta volver a importar `petcare.sql` ni ejecutar `setup_database.py` en cada inicio si la base y las cuentas ya están configuradas. Solo se ejecutan nuevamente cuando cambias de equipo, reinstalas XAMPP o necesitas preparar una instalación nueva.

## Cómo se conserva la sesión

Al iniciar sesión, el backend crea una cookie firmada que el navegador conserva. Si marcas la opción de recordar sesión, la cookie permanece hasta 30 días; sin esa opción permanece hasta 8 horas.

Cuando vuelves a abrir el sitio dentro de ese plazo:

- el navegador envía la cookie automáticamente;
- el backend verifica que el usuario todavía exista;
- el servidor comprueba que la cuenta siga activa;
- el servidor vuelve a consultar el rol desde MariaDB;
- si el rol cambió, el acceso se ajusta automáticamente.

La protección no depende de mostrar u ocultar botones. El servidor vuelve a autorizar cada ruta administrativa. Si cierras sesión manualmente, eliminamos la cookie. Si cambias la contraseña en una implementación posterior, conviene además revocar las sesiones anteriores desde el servidor.

Esto es persistencia de inicio de sesión en el navegador, no todavía una tabla pública de sesiones. La cookie puede cerrarse al vencer, al cerrar manualmente la sesión o al cambiar el secreto `SESSION_SECRET`. No es necesario usar Docker.

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
- una tabla para revocar todas las sesiones de manera inmediata;
- bloqueo temporal ante intentos repetidos de inicio de sesión;
- auditoría detallada de acciones administrativas;
- configuración completa de despliegue HTTPS.

## Cierre

Con esta integración ya tenemos una base real sobre la cual seguir construyendo PetCare. Ahora el servidor puede reconocer a una persona, confirmar su sesión y decidir qué puede hacer según su rol. Lo importante es que esa decisión ocurre en el backend y no solamente en los botones o páginas del navegador.
