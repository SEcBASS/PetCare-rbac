# Backend RBAC de PetCare

## Requisitos

- XAMPP con Apache y MariaDB activos en Windows.
- Python 3.10 o superior.
- El repositorio ubicado dentro de una carpeta accesible desde Apache.

## Configuración con XAMPP

1. Abre el Panel de Control de XAMPP e inicia Apache y MySQL.
2. Crea o abre la base `petcare` en `http://localhost/phpmyadmin`.
3. Importa el archivo `DATABASE/petcare.sql` desde la pestaña Importar.
4. Copia la configuración de ejemplo:

```powershell
Copy-Item .env.example .env
```

5. Revisa `.env` usando los valores normales de XAMPP:

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

6. Instala las dependencias:

```powershell
python -m pip install -r requirements.txt
```

7. Puedes repetir la creación de cuentas de desarrollo:

```powershell
python setup_database.py
```

8. Arranca FastAPI:

```powershell
uvicorn main:app --host 127.0.0.1 --port 8001
```

Si el frontend está dentro de `htdocs`, ejecuta XAMPP desde `http://localhost/PETCARE/PETCARE-main/PETCARE, Modulo/FRONTEND/HTML/`.

## Cuentas iniciales

- Administrador: `admin@petcare.com` / `Admin123!`
- Usuario: `usuario@petcare.com` / `Usuario123!`

Cambialas mediante las variables `ADMIN_*` y `USER_*` antes de ejecutar el script. Estas cuentas son solo para desarrollo.

## Endpoints RBAC

- `POST /api/auth/registro`: crea siempre `usuario`.
- `POST /api/auth/login`: inicia sesión y crea una cookie `HttpOnly`.
- `GET /api/sesion`: devuelve la sesión actual.
- `DELETE /api/sesion`: cierra la sesión.
- `GET /api/admin/resumen`: permite únicamente `administrador`.
