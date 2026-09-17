# VoiceClone

A self-hosted SaaS voice-cloning platform. Anyone can sign up, clone a voice from a short
sample, generate speech with it and download the result. Usage is metered in credits
(1 credit = 1 character) with monthly allowances per plan tier.

| Tier  | Credits / month | Custom voices |
| ----- | --------------- | ------------- |
| Free  | 5,000           | 3             |
| Pro   | 100,000         | 10            |
| Scale | 500,000         | 30            |

Two platform voices, **Aria — Professional Female** and **Marcus — Professional Male**, are
available to every account and never count toward the voice limit.

## Architecture

```
frontend (Vite + React)  ──►  Django (auth, profile, credits, voices, history, downloads)
        │                          │
        └──────────────────────►  FastAPI (POST /api/generate/, status polling)
                                   │  charges credits via Django's internal endpoint
                                   ▼
                               Celery ── tts_worker (F5-TTS on GPU, Whisper transcription)
                                   │
                        PostgreSQL · Redis · MinIO (S3)
```

- `services/django` — REST API, JWT auth, credit accounting, Celery Beat schedule.
- `services/fastapi` — generation entry point; validates the voice, pre-checks credits,
  creates the generation row, charges credits, queues the TTS job.
- `services/tts_worker` — GPU worker: voice-sample processing (convert, trim, transcribe) and
  speech synthesis.
- `django_worker` (compose service) — runs Django-side Celery tasks on the `django` queue,
  currently the daily credit reset.
- `frontend` — the VoiceClone web app.

## Running

```bash
cp .env.example .env            # adjust secrets for anything but local dev
docker compose up -d --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py loaddata users        # optional demo accounts
docker compose exec web python manage.py seed_default_voices   # uploads bundled clips + fixture
```

Open http://localhost:5173 and sign up. The API is at http://localhost:8000, the generation
service at http://localhost:8001, MinIO console at http://localhost:9001.

`seed_default_voices` copies `voice_assets/defaults/aria.wav` and `marcus.wav` to the S3 keys
referenced by `apps/prompts/fixtures/voice_models.json`, then loads the fixture. It is idempotent.

## API

| Method | Path                               | Notes                                            |
| ------ | ---------------------------------- | ------------------------------------------------ |
| POST   | `/api/auth/register/`              | `{username, email, password, confirm_password}` → tokens + profile |
| POST   | `/api/auth/token/`                 | login with username **or** email                 |
| POST   | `/api/auth/token/refresh/`         |                                                  |
| POST   | `/api/auth/token/verify/`          |                                                  |
| GET    | `/api/user/profile/`               | tier, credits, voice usage                       |
| PATCH  | `/api/user/profile/`               | `username`, `email` only                         |
| PATCH  | `/api/user/credits/deduct/`        | internal — needs `X-Internal-Token`              |
| GET    | `/api/voice-models/`               | default voices + caller's clones                 |
| POST   | `/api/voice-models/upload/`        | multipart; 403 `voice_limit_reached` at the cap  |
| POST   | `/api/voice-models/{id}/activate/` |                                                  |
| GET/DELETE | `/api/voice-models/{id}/`      | defaults cannot be deleted                       |
| POST   | `/api/generate/`  (FastAPI)        | 402 `insufficient_credits` when over budget      |
| GET    | `/api/generate/status/{job}/`      |                                                  |
| GET    | `/api/prompts/`                    | caller's generation history, newest first        |
| GET    | `/api/prompts/{id}/`               |                                                  |
| GET    | `/api/prompts/{id}/download/?format=mp3\|wav` | 302 to a signed URL; `&as=json` returns it as JSON |
| DELETE | `/api/prompts/{id}/delete/`        |                                                  |

JWT access tokens carry `username`, `email`, `tier`, `credits_remaining`, `credits_limit`
and `voice_clone_limit`.

## Credits

- Charged when a generation is accepted: `len(text)` credits, recorded on the generation as
  `credits_charged`.
- FastAPI pre-checks the balance, then charges through Django's atomic deduct endpoint. If the
  charge is refused the generation row is removed and the client gets 402.
- `apps.users.tasks.reset_expired_credits` runs daily (Celery Beat, 00:05 UTC) and zeroes usage
  for accounts whose 30-day window has elapsed.

## Testing

Backend (against the running stack, stdlib only):

```bash
python scripts/api_smoke.py voice_assets/defaults/aria.wav
```

Frontend end-to-end (Playwright on the host; the browser must reach the API on localhost):

```bash
cd frontend
npm ci && npx playwright install chromium
npx playwright test
```

The suite registers throwaway accounts, generates real speech on the GPU worker, downloads MP3
and WAV, exhausts the credit balance, hits the 3-voice limit, and exercises the command palette,
feedback modal, profile dropdown and settings.

## Environment

See `.env.example`. Notable additions:

- `INTERNAL_API_TOKEN` — shared secret between FastAPI and Django for credit deduction.
- `DJANGO_INTERNAL_URL` — where FastAPI reaches Django inside the compose network.
- `ALLOWED_HOSTS` must include `web` (the in-network hostname); settings add it automatically.
