import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
)
from pydantic import BaseModel

from config import DATA_DIR


router = APIRouter(prefix="/api/auth", tags=["Auth"])

password_hasher = PasswordHasher()

COOKIE_NAME = "tegger_session"
SESSION_DAYS = 7

DB_PATH = Path(DATA_DIR) / "auth.sqlite3"


class LoginRequest(BaseModel):
    username: str
    password: str


def get_connection():
    connection = sqlite3.connect(
        DB_PATH,
        timeout=10,
    )

    connection.row_factory = sqlite3.Row

    return connection


def initialize_auth():
    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )


def hash_token(token):
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def _load_admin_password_hash():
    """Resolve argon2 hash without relying on Compose-interpolated `$` values."""
    expected_hash = os.getenv("TEGGER_ADMIN_PASSWORD_HASH", "").strip()

    if expected_hash.startswith("$argon2"):
        return expected_hash

    b64 = os.getenv("TEGGER_ADMIN_PASSWORD_HASH_B64", "").strip()
    if b64:
        try:
            import base64

            decoded = base64.b64decode(b64).decode("utf-8").strip()
            if decoded.startswith("$argon2"):
                return decoded
        except (ValueError, UnicodeDecodeError):
            pass

    # Volume path (optional): /data/admin.hash — no host bind-mount required
    for candidate in (
        os.getenv("TEGGER_ADMIN_PASSWORD_HASH_FILE", "").strip(),
        str(Path(DATA_DIR) / "admin.hash"),
        str(Path(DATA_DIR).parent / "admin.hash"),
    ):
        if not candidate:
            continue
        try:
            text = Path(candidate).read_text(encoding="utf-8")
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("$argon2"):
                return line

    return ""


def verify_credentials(username, password):
    expected_username = os.getenv(
        "TEGGER_ADMIN_USERNAME",
        "",
    )

    expected_hash = _load_admin_password_hash()

    # Prefer plaintext in .env — Compose-safe (no `$`)
    expected_password = os.getenv(
        "TEGGER_ADMIN_PASSWORD",
        "",
    )

    if not expected_username:
        return False

    if not expected_hash and not expected_password:
        return False

    if not secrets.compare_digest(
        username,
        expected_username,
    ):
        return False

    if expected_password and secrets.compare_digest(
        password,
        expected_password,
    ):
        return True

    if not expected_hash:
        return False

    try:
        return password_hasher.verify(
            expected_hash,
            password,
        )

    except (VerificationError, ValueError):
        return False


def create_session(username):
    token = secrets.token_urlsafe(48)

    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(days=SESSION_DAYS)
    )

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sessions (
                token_hash,
                username,
                expires_at
            )
            VALUES (?, ?, ?)
            """,
            (
                hash_token(token),
                username,
                expires_at.isoformat(),
            ),
        )

    return token


def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    with get_connection() as connection:
        session = connection.execute(
            """
            SELECT username, expires_at
            FROM sessions
            WHERE token_hash = ?
            """,
            (hash_token(token),),
        ).fetchone()

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid session",
        )

    expires_at = datetime.fromisoformat(
        session["expires_at"]
    )

    if datetime.now(timezone.utc) >= expires_at:
        raise HTTPException(
            status_code=401,
            detail="Session expired",
        )

    return {
        "username": session["username"],
        "role": "admin",
    }


@router.post("/login")
def login(
    data: LoginRequest,
    response: Response,
):
    if not verify_credentials(
        data.username,
        data.password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль",
        )

    token = create_session(data.username)

    cookie_secure = os.getenv(
        "TEGGER_COOKIE_SECURE",
        "",
    ).strip().lower() in {"1", "true", "yes"}

    if not cookie_secure:
        frontend_origin = os.getenv(
            "FRONTEND_ORIGIN",
            "",
        ).strip().lower()
        cookie_secure = frontend_origin.startswith("https://")

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=cookie_secure,
        samesite="lax" if cookie_secure else "strict",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )

    return {
        "ok": True,
        "user": {
            "username": data.username,
            "role": "admin",
        },
    }


@router.get("/me")
def me(
    user=Depends(get_current_user),
):
    return user


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(get_current_user),
):
    token = request.cookies.get(COOKIE_NAME)

    if token:
        with get_connection() as connection:
            connection.execute(
                """
                DELETE FROM sessions
                WHERE token_hash = ?
                """,
                (hash_token(token),),
            )

    cookie_secure = os.getenv(
        "TEGGER_COOKIE_SECURE",
        "",
    ).strip().lower() in {"1", "true", "yes"}

    if not cookie_secure:
        frontend_origin = os.getenv(
            "FRONTEND_ORIGIN",
            "",
        ).strip().lower()
        cookie_secure = frontend_origin.startswith("https://")

    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=cookie_secure,
        samesite="lax" if cookie_secure else "strict",
    )

    return {"ok": True}