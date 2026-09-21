"""
Cheap, format-only sniff check for uploaded reference audio.

Shared by the API upload view and the admin upload form so a client that
mangles the file in transit (e.g. a PowerShell script that pushes binary
bytes through a text/string encoding step) fails fast with a clear error
instead of silently staging garbage that only surfaces as a cryptic ffmpeg
error deep in the Celery worker.
"""

MIN_AUDIO_BYTES = 256

# The 3-byte UTF-8 encoding of U+FFFD (REPLACEMENT CHARACTER). A client that
# builds its multipart body as a text string (e.g. PowerShell code that reads
# the file as text, or forces the payload through .Encoding]::UTF8.GetBytes)
# replaces every byte in the audio that isn't valid UTF-8 with this sequence.
# It essentially never occurs naturally in real compressed/PCM audio, so
# finding more than a couple is a strong corruption signal — and it's the one
# check here that a pure-ASCII container header (ID3/RIFF both are) can't
# hide from, since the mangling happens throughout the body, not just the
# first few bytes.
_REPLACEMENT_CHAR = b"\xef\xbf\xbd"
_REPLACEMENT_CHAR_THRESHOLD = 3


def looks_like_audio(uploaded_file):
    """True if `uploaded_file` has a recognizable WAV/MP3 header and doesn't
    show signs of having been forced through a text encoding round-trip."""
    uploaded_file.seek(0)
    header = uploaded_file.read(12)

    has_valid_header = (
        len(header) >= 4
        and (
            (header[:4] == b"RIFF" and header[8:12] == b"WAVE")
            or header[:3] == b"ID3"
            or header[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xfa", b"\xff\xf2")
        )
    )
    if not has_valid_header:
        uploaded_file.seek(0)
        return False

    body = uploaded_file.read()
    uploaded_file.seek(0)
    was_text_mangled = body.count(_REPLACEMENT_CHAR) >= _REPLACEMENT_CHAR_THRESHOLD

    return not was_text_mangled
