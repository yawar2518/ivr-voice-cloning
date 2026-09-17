import os
from pathlib import Path
from decouple import config

# ─── Paths ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Security ──────────────────────────────────────────────────────────────
SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost").split(",")
# The FastAPI service reaches Django on the compose network as "web" for
# internal credit deductions; always accept that hostname.
for _internal_host in ("web", "127.0.0.1"):
    if _internal_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_internal_host)

# ─── Applications ──────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "guardian",

    # Our apps — added as we build them
    "apps.users",
    "apps.prompts",
    "apps.audit",
]

# ─── Middleware ─────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # must be first
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"

# ─── Templates ─────────────────────────────────────────────────────────────
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─── Database ──────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "ivr_voice",
        "USER": "postgres",
        "PASSWORD": "postgres",
        "HOST": config("DATABASE_URL", default="db").split("@")[-1].split(":")[0],
        "PORT": "5432",
    }
}

# ─── Custom User Model ─────────────────────────────────────────────────────
# We tell Django to use our custom User model instead of the default one.
# This must be set before the first migration is run — cannot change later.
AUTH_USER_MODEL = "users.User"

# ─── Password Validation ───────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─── Internationalization ──────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ─── Static Files ──────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ─── Default Primary Key ───────────────────────────────────────────────────
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── CORS ──────────────────────────────────────────────────────────────────
# Allows Ahtesham's Vite dev server to call our API
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173"
).split(",")

# ─── Django REST Framework ─────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Add pagination
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    # The download endpoint uses ?format=mp3|wav as an ordinary query
    # parameter; stop DRF from reading it as a renderer override.
    "URL_FORMAT_OVERRIDE": None,
}

# ─── SimpleJWT ─────────────────────────────────────────────────────────────
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # This tells SimpleJWT to include our custom claims in the token
    "TOKEN_OBTAIN_SERIALIZER": "apps.users.serializers.CustomTokenObtainPairSerializer",
}

# ─── Django Guardian ───────────────────────────────────────────────────────
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "guardian.backends.ObjectPermissionBackend",
]

# ─── Internal service-to-service auth ──────────────────────────────────────
# Shared secret the FastAPI generation service presents (X-Internal-Token)
# when it calls PATCH /api/user/credits/deduct/. Falls back to a value
# derived from SECRET_KEY so a single-host dev setup needs no extra config.
INTERNAL_API_TOKEN = config("INTERNAL_API_TOKEN", default=f"internal-{SECRET_KEY}")

# ─── Celery ────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = config("REDIS_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = config("REDIS_URL", default="redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# Django-side tasks (credit resets) run on a dedicated queue consumed by the
# `django_worker` service. The GPU tts_worker only listens on the default
# "celery" queue, so nothing Django-specific ever lands on it.
CELERY_TASK_ROUTES = {
    "apps.users.tasks.*": {"queue": "django"},
}

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    "reset-expired-credits-daily": {
        "task": "apps.users.tasks.reset_expired_credits",
        "schedule": crontab(hour=0, minute=5),
        "options": {"queue": "django"},
    },
}

# ─── Storage — MinIO (dev) / AWS S3 (prod) ─────────────────────────────────
USE_S3 = config("USE_S3", default=False, cast=bool)

if USE_S3:
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="us-east-1")
    # Remove this line in production for real AWS S3
    AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default=None)
    AWS_DEFAULT_ACL = None
    AWS_S3_FILE_OVERWRITE = False

    # Endpoint the *browser* can reach. AWS_S3_ENDPOINT_URL above is the
    # in-network address ("http://minio:9000") — it resolves inside the compose
    # network but not on the user's machine, so a pre-signed URL built from it
    # is useless to the frontend. Pre-signing is an offline computation, so we
    # sign against this public address directly rather than string-replacing the
    # host afterwards. In production both point at the same real S3 endpoint.
    AWS_S3_PUBLIC_ENDPOINT_URL = config(
        "AWS_S3_PUBLIC_ENDPOINT_URL",
        default="http://localhost:9000",
    )
    AWS_S3_PRESIGN_EXPIRY = config(
        "AWS_S3_PRESIGN_EXPIRY", default=3600, cast=int
    )