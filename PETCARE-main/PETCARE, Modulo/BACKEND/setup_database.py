import os
import sys
from pathlib import Path

import bcrypt
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

config = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
}
database = os.getenv("DB_NAME", "petcare")
sql_file = Path(__file__).resolve().parent.parent / "DATABASE" / "petcare.sql"


def main():
    if not sql_file.is_file():
        raise SystemExit(f"No se encontró el esquema: {sql_file}")

    connection = mysql.connector.connect(**config)
    cursor = connection.cursor()
    cursor.execute("CREATE DATABASE IF NOT EXISTS " + f"`{database}`" + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    cursor.execute("USE " + f"`{database}`")

    cursor.execute("SHOW TABLES LIKE 'usuarios'")
    if cursor.fetchone() is None:
        print("Importando petcare.sql...")
        statements = []
        current = []
        for line in sql_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("--"):
                continue
            current.append(line)
            if stripped.endswith(";"):
                statements.append("\n".join(current))
                current = []

        for statement in statements:
            if not statement.strip():
                continue
            try:
                cursor.execute(statement)
            except mysql.connector.Error as error:
                if "already exists" not in str(error).lower():
                    raise

    users = (
        (
            os.getenv("ADMIN_EMAIL", "admin@petcare.com"),
            os.getenv("ADMIN_PASSWORD", "Admin123!"),
            "Administrador PetCare",
            "administrador",
        ),
        (
            os.getenv("USER_EMAIL", "usuario@petcare.com"),
            os.getenv("USER_PASSWORD", "Usuario123!"),
            "Usuario PetCare",
            "usuario",
        ),
    )

    for correo, password, nombre, rol in users:
        cursor.execute("SELECT id FROM usuarios WHERE correo = %s", (correo.lower(),))
        if cursor.fetchone() is None:
            password_hash = bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")
            cursor.execute(
                "INSERT INTO usuarios (rol, nombre_completo, correo, contrasena_hash, activo, correo_verificado_en, terminos_aceptados_en) "
                "VALUES (%s, %s, %s, %s, 1, NOW(), NOW())",
                (rol, nombre, correo.lower(), password_hash),
            )

    connection.commit()
    cursor.close()
    connection.close()

    print("Base de datos y cuentas iniciales listas.")
    print("Admin:", os.getenv("ADMIN_EMAIL", "admin@petcare.com"))
    print("Usuario:", os.getenv("USER_EMAIL", "usuario@petcare.com"))


if __name__ == "__main__":
    try:
        main()
    except mysql.connector.Error as error:
        print(f"Error de MySQL: {error}", file=sys.stderr)
        raise SystemExit(1)
