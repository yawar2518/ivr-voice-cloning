# ─── Base Image ────────────────────────────────────────────────────────────
FROM python:3.12-slim

# ─── Environment ───────────────────────────────────────────────────────────
# Prevents Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
# Prevents Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1

# ─── System Dependencies ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    # PostgreSQL client — needed by psycopg2
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ─── Working Directory ─────────────────────────────────────────────────────
WORKDIR /app

# ─── Python Dependencies ───────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# ─── App Code ──────────────────────────────────────────────────────────────
COPY . .

# ─── Default Port ──────────────────────────────────────────────────────────
EXPOSE 8001