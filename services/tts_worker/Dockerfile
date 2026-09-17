# ─── Base Image ────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu22.04

# ─── Environment ───────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    python3.11-dev \
    ffmpeg \
    libsndfile1 \
    git \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Make python3.11 the default
RUN ln -sf /usr/bin/python3.11 /usr/bin/python && \
    ln -sf /usr/bin/python3.11 /usr/bin/python3

# ─── Working Directory ─────────────────────────────────────────────────────
WORKDIR /app

# ─── Step 1: Install PyTorch with CUDA 12.8 ────────────────────────────────
# F5-TTS docs recommend torch==2.8.0+cu128 but 2.9.1 also works
# Using 2.9.1 for Blackwell GPU (RTX 5050 sm_120) support
RUN pip install --upgrade pip && \
    pip install \
        torch==2.9.1+cu128 \
        torchaudio==2.9.1+cu128 \
        --index-url https://download.pytorch.org/whl/cu128

# ─── Step 2: Install F5-TTS ────────────────────────────────────────────────
# Single pip install — handles all its own dependencies cleanly
# No --no-deps tricks needed unlike Chatterbox
RUN pip install f5-tts

# f5-tts pulls in torchcodec as a dependency, but the prebuilt wheel's CUDA
# extension is ABI-incompatible with this image's torch/CUDA build (same
# libtorchcodec issue as the torchaudio shim in tasks.py — see there for
# details). transformers checks torchcodec's presence via package metadata,
# not a real import, so it unconditionally imports it inside the ASR
# pipeline's preprocess() whenever F5-TTS auto-transcribes a reference clip
# (ref_text=""), crashing with "Could not load this library:
# libtorchcodec_image.so". Nothing here needs torchcodec — audio loading goes
# through the soundfile-backed shim instead — so removing it avoids the crash
# entirely.
RUN pip uninstall -y torchcodec

# ─── Step 3: Install project requirements ──────────────────────────────────
COPY requirements.txt .
RUN pip install -r requirements.txt

# ─── Step 4: Copy app code ─────────────────────────────────────────────────
COPY . .

# ─── Step 5: Verify at build time ──────────────────────────────────────────
RUN python -c "\
import torch; \
print('PyTorch:', torch.__version__); \
print('CUDA at build (expected False):', torch.cuda.is_available()); \
from f5_tts.api import F5TTS; \
print('F5-TTS imported successfully')"