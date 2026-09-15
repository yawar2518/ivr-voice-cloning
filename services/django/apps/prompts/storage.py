"""
Pre-signed URL helpers for MinIO / S3.

Pre-signing is a local HMAC over the request — boto3 never contacts the server —
so the client used here is built against AWS_S3_PUBLIC_ENDPOINT_URL (the address
the browser can reach) rather than the in-network AWS_S3_ENDPOINT_URL. That is
what makes the returned link usable from outside the compose network, and it
keeps working if the deployment ever moves to SigV4, where the host is part of
the signed payload and a post-hoc string replacement would break it.
"""

import boto3
from botocore.client import Config
from django.conf import settings


def _public_client():
    return boto3.client(
        "s3",
        endpoint_url=getattr(settings, "AWS_S3_PUBLIC_ENDPOINT_URL", None),
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=getattr(settings, "AWS_S3_REGION_NAME", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def presigned_url(s3_key, download_as=None, content_type=None, expires_in=None):
    """
    Build a browser-reachable pre-signed GET URL for `s3_key`.

    download_as -- when given, MinIO echoes back a Content-Disposition
                   attachment header with this filename. Needed because the
                   frontend is served from a different origin than MinIO, and
                   browsers ignore the <a download> attribute cross-origin; the
                   header is what actually forces a named file download.
    Returns None when there is no key, so callers can treat "not exported yet"
    and "no audio" the same way.
    """
    if not s3_key:
        return None

    params = {
        "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
        "Key": s3_key,
    }
    if content_type:
        params["ResponseContentType"] = content_type
    if download_as:
        params["ResponseContentDisposition"] = f'attachment; filename="{download_as}"'

    return _public_client().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=expires_in or getattr(settings, "AWS_S3_PRESIGN_EXPIRY", 3600),
    )


def export_download_url(prompt):
    """Pre-signed link to a prompt's exported 8 kHz IVR WAV, or None."""
    return presigned_url(
        prompt.export_s3_key,
        download_as=f"ivr_prompt_{prompt.id}_8khz.wav",
        content_type="audio/wav",
    )
