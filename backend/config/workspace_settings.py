"""Runnable local integration; original PostgreSQL configuration remains available."""
from .settings import *
import secrets

WORKSPACE_ROOT = BASE_DIR.parent
LOCAL_DIR = WORKSPACE_ROOT / '.local'
LOCAL_DIR.mkdir(exist_ok=True)
_secret_file = LOCAL_DIR / 'django-secret.txt'
if not os.environ.get('DJANGO_SECRET_KEY'):
    if not _secret_file.exists(): _secret_file.write_text(secrets.token_urlsafe(48), encoding='utf-8')
    SECRET_KEY = _secret_file.read_text(encoding='utf-8').strip()
DEBUG = os.environ.get('DJANGO_DEBUG', '0') == '1'
if os.environ.get('HODHOD_DATABASE', 'sqlite') == 'sqlite':
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': LOCAL_DIR / 'brain.sqlite3', 'OPTIONS': {'timeout': 45, 'transaction_mode': 'IMMEDIATE'}}}
CSRF_TRUSTED_ORIGINS = os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5176,http://127.0.0.1:5177').split(',')
SESSION_COOKIE_NAME = 'hodhod_brain_session'
CSRF_COOKIE_NAME = 'hodhod_brain_csrf'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
LLM_PROVIDER = os.environ.get('LLM_PROVIDER', 'openai')
LLM_MODEL = os.environ.get('LLM_MODEL', 'gpt-5-mini')
AGENT_MODE = os.environ.get('AGENT_MODE', 'llm' if LLM_API_KEY else 'grounded')
