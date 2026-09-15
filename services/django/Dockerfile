# ─── Base Image ────────────────────────────────────────────────────────────
FROM python:3.12-slim

# ─── Environment ───────────────────────────────────────────────────────────
# Prevents Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
# Prevents Python from buffering stdout/stderr (you see logs immediately)
ENV PYTHONUNBUFFERED=1

# ─── System Dependencies ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    # PostgreSQL client — needed by psycopg2
    libpq-dev \
    gcc \
    # curl — useful for healthchecks and debugging inside container
    curl \
    # ffmpeg — converts uploaded voice reference clips to 44.1kHz WAV
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ─── Working Directory ─────────────────────────────────────────────────────
WORKDIR /app

# ─── Python Dependencies ───────────────────────────────────────────────────
# Copy requirements first — Docker caches this layer
# so rebuilds are faster when only your code changes
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# ─── App Code ──────────────────────────────────────────────────────────────
COPY . .

# ─── Default Port ──────────────────────────────────────────────────────────
EXPOSE 8000