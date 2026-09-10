import os
from celery import Celery

# Tell Celery which Django settings module to use
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# Create the Celery application
app = Celery("ivr_voice")

# Load Celery configuration from Django settings
# All Celery settings in settings.py start with CELERY_
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks from all installed apps
# Celery will look for a tasks.py file in each app
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """
    A simple test task to verify Celery is working.
    Run with: celery -A core call core.celery.debug_task
    """
    print(f"Request: {self.request!r}")