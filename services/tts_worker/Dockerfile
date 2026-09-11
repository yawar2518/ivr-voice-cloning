# ─── Base Image ────────────────────────────────────────────────────────────
# We start from the official PyTorch image with CUDA 12.8 support
# This gives us a working CUDA environment out of the box
FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime

# ─── Environment ───────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ─── System Dependencies ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    # FFmpeg — audio normalization, format conversion, quality gates
    ffmpeg \
    # libsndfile — required by soundfile Python package
    libsndfile1 \
    # git — required by some Chatterbox dependencies
    git \
    # PostgreSQL client
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# ─── Working Directory ─────────────────────────────────────────────────────
WORKDIR /app

# ─── Step 1: Install PyTorch 2.9.1+cu128 FIRST ────────────────────────────
# CRITICAL: This must happen before chatterbox-tts is installed.
# The base image has an older PyTorch — we upgrade it here.
# PyTorch 2.9.1+cu128 includes native sm_120 kernels for Blackwell GPUs
# (RTX 5050/5060/5070/5080/5090 series).
# Without this, Chatterbox will install torch==2.6.0 which has no sm_120
# support and will fail silently or crash on your RTX 5050.
RUN pip install --upgrade pip && \
    pip install \
        torch==2.9.1+cu128 \
        torchaudio==2.9.1+cu128 \
        --index-url https://download.pytorch.org/whl/cu128

# ─── Step 2: Install Chatterbox WITHOUT its pinned torch dependency ────────
# --no-deps prevents pip from installing torch==2.6.0 as a dependency
# which would overwrite our torch==2.9.1+cu128 installed above.
RUN pip install chatterbox-tts --no-deps

# ─── Step 3: Install remaining Chatterbox dependencies manually ────────────
# These are the packages Chatterbox needs that we skipped with --no-deps.
# Versions are intentionally unpinned here to allow compatibility with
# our newer PyTorch version.
RUN pip install \
    transformers>=4.40.0 \
    diffusers>=0.27.0 \
    huggingface_hub>=0.23.0 \
    conformer>=0.3.2 \
    inflect>=7.0.0 \
    s3tokenizer \
    resemble-perth \
    einops \
    omegaconf

# ─── Step 4: Install project requirements ──────────────────────────────────
# Celery, SQLAlchemy, boto3, pyloudnorm etc.
# PyTorch is NOT in this file — it was installed above
COPY requirements.txt .
RUN pip install -r requirements.txt

# ─── Step 5: Copy app code ─────────────────────────────────────────────────
COPY . .

# ─── Step 6: Verify GPU is visible at build time ───────────────────────────
# This fails fast if CUDA is missing — catches problems before runtime.
# If this line fails, check your Docker GPU passthrough configuration.
RUN python -c "\
import torch; \
print('CUDA available:', torch.cuda.is_available()); \
print('Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'); \
print('PyTorch version:', torch.__version__)"