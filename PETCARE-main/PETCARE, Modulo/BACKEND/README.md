# Backend RBAC de PetCare

## Requisitos

- MariaDB/MySQL ejecutándose en el host configurado.
- Python 3.10 o superior.

## Configuración

1. Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

2. Cambia `SESSION_SECRET` y las credenciales de MySQL en `.env`.
3. Instala las dependencias:

```bash
python -m pip install -r requirements.txt
```

4. Inicializa la base y crea las cuentas de desarrollo:

```bash
python setup_database.py
```

5. Arranca el servidor:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

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
