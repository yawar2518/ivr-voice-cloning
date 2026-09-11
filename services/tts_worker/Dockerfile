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

# ─── Step 1: Install PyTorch 2.9.1+cu128 FIRST ────────────────────────────
# Must happen before chatterbox-tts — it pins torch==2.6.0 which has no
# sm_120 kernels for Blackwell GPUs (RTX 5050/5060 series)
RUN pip install --upgrade pip && \
    pip install \
        torch==2.9.1+cu128 \
        torchaudio==2.9.1+cu128 \
        --index-url https://download.pytorch.org/whl/cu128

# ─── Step 2: Install Chatterbox WITHOUT its pinned torch dependency ────────
RUN pip install chatterbox-tts --no-deps

# ─── Step 3: Install Chatterbox dependencies with correct pinned versions ──
# Versions are pinned to match chatterbox-tts==0.1.7 exactly
# to avoid runtime import errors
RUN pip install \
    transformers==5.2.0 \
    diffusers==0.29.0 \
    safetensors==0.5.3 \
    huggingface_hub==0.33.0 \
    conformer==0.3.2 \
    inflect==7.3.1 \
    s3tokenizer \
    resemble-perth \
    einops \
    omegaconf \
    librosa \
    pykakasi==2.3.0 \
    spacy-pkuseg

# ─── Step 4: Install project requirements ──────────────────────────────────
COPY requirements.txt .
RUN pip install -r requirements.txt

# ─── Step 5: Copy app code ─────────────────────────────────────────────────
COPY . .

# ─── Step 6: Verify PyTorch version at build time ──────────────────────────
RUN python -c "\
import torch; \
print('PyTorch version:', torch.__version__); \
print('CUDA available at build:', torch.cuda.is_available()); \
print('Note: CUDA=False at build time is expected — GPU only available at runtime')"