# This file makes core/ a Python package.
# It also loads the Celery app when Django starts
# so Celery tasks are registered automatically.
from .celery import app as celery_app

__all__ = ["celery_app"]