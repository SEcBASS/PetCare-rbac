import os
import secrets
import threading
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import mysql.connector
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv()

DATABASE_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "petcare"),
}
SESSION_SECRET = os.getenv("SESSION_SECRET")
SESSION_COOKIE = "petcare_session"
CORS_ORIGINS = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS", "http://localhost:8080"
).split(",") if origin.strip()]
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_SHORT_SECONDS = 8 * 60 * 60
SESSION_LONG_SECONDS = 30 * 24 * 60 * 60

if not SESSION_SECRET:
    raise RuntimeError("Configura SESSION_SECRET con una clave aleatoria larga.")

_db_pool = None
_db_lock = threading.Lock()


def get_db_pool():
    global _db_pool
    if _db_pool is None:
        with _db_lock:
            if _db_pool is None:
                _db_pool = mysql.connector.pooling.MySQLConnectionPool(
                    pool_name="petcare_pool",
                    pool_size=5,
                    **DATABASE_CONFIG,
                )
    return _db_pool


def db_connection():
    try:
        connection = get_db_pool().get_connection()
    except mysql.connector.Error as error:
        raise HTTPException(status_code=503, detail="Base de datos no disponible") from error
    try:
        yield connection
    finally:
        connection.close()


class UsuarioRegistro(BaseModel):
    nombre_completo: str = Field(min_length=2, max_length=120)
    correo: EmailStr
    contrasena: str = Field(min_length=8, max_length=72)
    acepta_terminos: bool


class UsuarioLogin(BaseModel):
    correo: EmailStr
    contrasena: str = Field(min_length=1, max_length=72)
    recordarme: bool = False


def usuario_publico(row: dict) -> dict:
    return {
        "id": row["id"],
        "nombre_completo": row["nombre_completo"],
        "correo": row["correo"],
        "rol": row["rol"],
        "foto_url": row.get("avatar_url") if isinstance(row, dict) else None,
        "activo": bool(row["activo"]),
    }


def obtener_usuario_por_id(connection, user_id: int) -> dict | None:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, rol, nombre_completo, correo, activo, avatar_url "
            "FROM usuarios WHERE id = %s",
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def obtener_usuario_por_correo(connection, correo: str) -> dict | None:
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, rol, nombre_completo, correo, contrasena_hash, activo, avatar_url "
            "FROM usuarios WHERE correo = %s",
            (correo.lower(),),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def crear_sesion_cookie(response: JSONResponse, user_id: int, recordar: bool) -> None:
    max_age = SESSION_LONG_SECONDS if recordar else SESSION_SHORT_SECONDS
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(seconds=max_age),
            "jti": secrets.token_urlsafe(24),
        },
        SESSION_SECRET,
        algorithm="HS256",
    )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )


def decodificar_sesion(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    try:
        payload = jwt.decode(
            token,
            SESSION_SECRET,
            algorithms=["HS256"],
            options={"require": ["sub", "iat", "exp"]},
        )
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")


def obtener_usuario_actual(
    request: Request,
    connection=Depends(db_connection),
) -> dict:
    payload = decodificar_sesion(request)
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Sesión inválida")

    row = obtener_usuario_por_id(connection, user_id)
    if not row or not row["activo"]:
        raise HTTPException(status_code=401, detail="Sesión inválida")
    return row


def require_roles(*roles: str):
    permitidos = frozenset(roles)

    def dependency(usuario: dict = Depends(obtener_usuario_actual)) -> dict:
        if usuario["rol"] not in permitidos:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        return usuario

    return dependency


class RoleMiddleware(BaseHTTPMiddleware):
    """Protege rutas bajo /api/admin consultando el usuario actual en la base de datos."""

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/admin"):
            return await call_next(request)

        connection = None
        cursor = None
        try:
            payload = decodificar_sesion(request)
            connection = get_db_pool().get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                "SELECT id, rol, nombre_completo, correo, activo, avatar_url "
                "FROM usuarios WHERE id = %s",
                (int(payload["sub"]),),
            )
            usuario = cursor.fetchone()
            if not usuario or not usuario["activo"]:
                raise HTTPException(status_code=401, detail="Sesión inválida")
            if usuario["rol"] != "administrador":
                raise HTTPException(status_code=403, detail="Acceso denegado")
            request.state.usuario = usuario
        except HTTPException as error:
            return JSONResponse(
                status_code=error.status_code,
                content={"error": str(error.detail), "campos": {}},
            )
        except (mysql.connector.Error, jwt.PyJWTError, KeyError, ValueError, TypeError):
            return JSONResponse(
                status_code=503,
                content={"error": "Servicio no disponible", "campos": {}},
            )
        finally:
            if cursor is not None:
                cursor.close()
            if connection is not None:
                connection.close()

        return await call_next(request)


app = FastAPI(title="PetCare API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With"],
)
app.add_middleware(RoleMiddleware)


@app.exception_handler(HTTPException)
async def manejar_http_exception(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "campos": {}})


@app.exception_handler(RequestValidationError)
async def manejar_validacion(request: Request, exc: RequestValidationError):
    campos = {}
    for error in exc.errors():
        campo = error["loc"][-1] if error.get("loc") else "solicitud"
        campos[str(campo)] = error["msg"]
    return JSONResponse(status_code=422, content={"error": "Datos inválidos", "campos": campos})


@app.middleware("http")
async def verificar_origen(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in CORS_ORIGINS:
            return JSONResponse(status_code=403, content={"error": "Origen no permitido", "campos": {}})
    return await call_next(request)


@app.post("/api/auth/login")
async def login(datos: UsuarioLogin, connection=Depends(db_connection)):
    usuario = obtener_usuario_por_correo(connection, str(datos.correo))
    if not usuario or not usuario["activo"]:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    hash_guardado = usuario.get("contrasena_hash")
    valido = False
    if hash_guardado:
        try:
            valido = bcrypt.checkpw(datos.contrasena.encode("utf-8")[:72], hash_guardado.encode("utf-8"))
        except (ValueError, UnicodeEncodeError):
            valido = False
    if not valido:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    response = JSONResponse({"usuario": usuario_publico(usuario)})
    crear_sesion_cookie(response, usuario["id"], datos.recordarme)
    cursor = connection.cursor()
    try:
        cursor.execute("UPDATE usuarios SET ultimo_acceso_en = NOW() WHERE id = %s", (usuario["id"],))
        connection.commit()
    finally:
        cursor.close()
    return response


@app.post("/api/auth/registro")
async def registro(datos: UsuarioRegistro, connection=Depends(db_connection)):
    if not datos.acepta_terminos:
        raise HTTPException(status_code=422, detail="Debes aceptar los términos")

    password_hash = bcrypt.hashpw(datos.contrasena.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO usuarios (rol, nombre_completo, correo, contrasena_hash, activo, terminos_aceptados_en) "
            "VALUES ('usuario', %s, %s, %s, 1, NOW())",
            (datos.nombre_completo.strip(), str(datos.correo).lower(), password_hash),
        )
        connection.commit()
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(status_code=409, detail="El correo ya está registrado") from error
    finally:
        cursor.close()
    return JSONResponse(status_code=201, content={"mensaje": "Cuenta creada correctamente"})


@app.get("/api/sesion")
async def sesion(usuario: dict = Depends(obtener_usuario_actual)):
    return {"usuario": usuario_publico(usuario), "notificaciones_sin_leer": 0}


@app.delete("/api/sesion")
async def cerrar_sesion():
    response = JSONResponse({"mensaje": "Sesión cerrada"})
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax")
    return response


@app.get("/api/admin/resumen")
async def resumen_administracion(usuario: dict = Depends(require_roles("administrador"))):
    return {"usuario": usuario_publico(usuario), "mensaje": "Acceso administrativo permitido"}