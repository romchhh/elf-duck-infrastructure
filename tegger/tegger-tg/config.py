import os

from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

# ============================================================

# PATHS

# ============================================================

RUNTIME_DIR = Path(

    os.getenv(

        "RUNTIME_DIR",

        str(BASE_DIR),

    )

).expanduser().resolve()

DATA_DIR = RUNTIME_DIR / "data"

SESSIONS_DIR = RUNTIME_DIR / "sessions"

DATA_DIR.mkdir(

    parents=True,

    exist_ok=True,

)

SESSIONS_DIR.mkdir(

    parents=True,

    exist_ok=True,

)


# ============================================================
# TELEGRAM
# ============================================================

API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
SESSION_NAME = os.getenv(
    "SESSION_NAME",
    "tegger",
).strip()


# ============================================================
# STORY
# ============================================================

def _story_env_key(sender_name: str) -> str:

    normalized = "".join(

        character.upper()

        if character.isalnum()

        else "_"

        for character in sender_name.strip()

    )

    return f"TEMPLATE_STORY_URL_{normalized}"

STORY_CAPTION = os.getenv(
    "STORY_CAPTION",
    "",
).strip()

# ============================================================
# MULTI-ACCOUNT / LIMITS
# ============================================================

SENDERS = [
    value.strip()
    for value in os.getenv("SENDERS", "").split(",")
    if value.strip()
]

TEMPLATE_STORY_URLS = {

    sender_name: os.getenv(

        _story_env_key(sender_name),

        "",

    ).strip()

    for sender_name in SENDERS

}

TARGETS_PER_SENDER_PER_DAY = int(
    os.getenv("TARGETS_PER_SENDER_PER_DAY", "14")
)

TARGETS_PER_STORY_MIN = int(
    os.getenv("TARGETS_PER_STORY_MIN", "2")
)

TARGETS_PER_STORY_MAX = int(
    os.getenv("TARGETS_PER_STORY_MAX", "3")
)

STORY_INTERVAL_MIN_SECONDS = int(
    os.getenv("STORY_INTERVAL_MIN_SECONDS", "900")
)

STORY_INTERVAL_MAX_SECONDS = int(
    os.getenv("STORY_INTERVAL_MAX_SECONDS", "1124")
)

INTERACTION_STORY_DELAY = int(
    os.getenv("INTERACTION_STORY_DELAY", "20")
)

MAX_CONCURRENT_SENDERS = int(
    os.getenv("MAX_CONCURRENT_SENDERS", "3")
)

DRY_RUN_RAW = os.getenv(
    "DRY_RUN",
    "true",
).strip().lower()

LOG_BOT_TOKEN = os.getenv(
    "LOG_BOT_TOKEN",
    "",
).strip()

LOG_CHAT_ID = os.getenv(
    "LOG_CHAT_ID",
    "",
).strip()

if DRY_RUN_RAW not in {
    "true",
    "false",
}:
    raise RuntimeError(
        "DRY_RUN должен быть только true или false"
    )

DRY_RUN = (
    DRY_RUN_RAW == "true"
)

def _proxy_env_key(sender_name: str) -> str:
    normalized = "".join(
        character.upper()
        if character.isalnum()
        else "_"
        for character in sender_name.strip()
    )

    return f"PROXY_{normalized}"


SENDER_PROXIES = {
    sender_name: os.getenv(
        _proxy_env_key(sender_name),
        "",
    ).strip()
    for sender_name in SENDERS
}


# ============================================================
# VALIDATION
# ============================================================

# API_ID / API_HASH / SENDERS are optional in env.
# Real Telegram API credentials + accounts are set in Tegger UI
# (Settings → API ID/Hash, Accounts → phone/session login).
_BOOTSTRAP = os.getenv(
    "TEGGER_BOOTSTRAP",
    "true",
).strip().lower() in {"1", "true", "yes"}

if not API_ID:
    API_ID = 1

if not API_HASH:
    API_HASH = "bootstrap"

# Env SENDERS is legacy; UI-added accounts live in data/ui_added_accounts.json
if not SENDERS:
    SENDERS = []
    TEMPLATE_STORY_URLS = {}
    SENDER_PROXIES = {}

if TARGETS_PER_SENDER_PER_DAY < 1:
    raise RuntimeError(
        "TARGETS_PER_SENDER_PER_DAY должен быть >= 1"
    )

if TARGETS_PER_STORY_MIN < 1:
    raise RuntimeError(
        "TARGETS_PER_STORY_MIN должен быть >= 1"
    )

if TARGETS_PER_STORY_MAX < TARGETS_PER_STORY_MIN:
    raise RuntimeError(
        "TARGETS_PER_STORY_MAX не может быть меньше "
        "TARGETS_PER_STORY_MIN"
    )

if TARGETS_PER_STORY_MAX > TARGETS_PER_SENDER_PER_DAY:
    raise RuntimeError(
        "TARGETS_PER_STORY_MAX не может быть больше "
        "TARGETS_PER_SENDER_PER_DAY"
    )

if STORY_INTERVAL_MIN_SECONDS < 0:
    raise RuntimeError(
        "STORY_INTERVAL_MIN_SECONDS должен быть >= 0"
    )

if STORY_INTERVAL_MAX_SECONDS < STORY_INTERVAL_MIN_SECONDS:
    raise RuntimeError(
        "STORY_INTERVAL_MAX_SECONDS не может быть меньше "
        "STORY_INTERVAL_MIN_SECONDS"
    )

if INTERACTION_STORY_DELAY < 0:
    raise RuntimeError(
        "INTERACTION_STORY_DELAY должен быть >= 0"
    )

if MAX_CONCURRENT_SENDERS < 1:
    raise RuntimeError(
        "MAX_CONCURRENT_SENDERS должен быть >= 1"
    )

if SENDERS and MAX_CONCURRENT_SENDERS > len(SENDERS):
    raise RuntimeError(
        "MAX_CONCURRENT_SENDERS не может быть больше "
        "количества SENDERS"
    )

for sender_name, proxy_url in SENDER_PROXIES.items():

    if (
        proxy_url
        and not proxy_url.lower().startswith(
            "socks5://"
        )
    ):
        raise RuntimeError(
            f"Proxy для {sender_name} должен быть "
            "в формате "
            "socks5://user:password@host:port"
        )