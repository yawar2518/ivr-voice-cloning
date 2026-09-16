"""End-to-end API test for the VoiceClone backend. Stdlib only."""
import base64
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

DJ = "http://localhost:8000"
FA = "http://localhost:8001"
import os
INTERNAL_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "dev-internal-token-change-me")
PASSED = []
FAILED = []


def call(method, url, body=None, token=None, headers=None, raw=None, content_type="application/json"):
    hdrs = {"Content-Type": content_type} if (body is not None or raw is not None) else {}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if headers:
        hdrs.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            try:
                return resp.status, json.loads(payload) if payload else None, ctype
            except ValueError:
                return resp.status, payload, ctype
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload) if payload else None, e.headers.get("Content-Type", "")
        except ValueError:
            return e.code, payload, ""


def check(name, cond, extra=""):
    (PASSED if cond else FAILED).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"  -> {extra}" if extra and not cond else ""))


def jwt_payload(token):
    seg = token.split(".")[1]
    seg += "=" * (-len(seg) % 4)
    return json.loads(base64.urlsafe_b64decode(seg))


def multipart(fields, file_field, filename, file_bytes):
    boundary = "----vc" + uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\nContent-Type: audio/wav\r\n\r\n".encode()
    out += file_bytes + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, f"multipart/form-data; boundary={boundary}"


print("\n=== 1. Registration ===")
uname = "tester_" + uuid.uuid4().hex[:6]
email = f"{uname}@example.com"
st, body, _ = call("POST", f"{DJ}/api/auth/register/", {"username": uname, "email": email, "password": "Str0ngPassw0rd!", "confirm_password": "Str0ngPassw0rd!"})
check("register returns 201 with tokens", st == 201 and "access" in body and "refresh" in body, (st, body))
check("new user has 5000 credits / free tier", body and body["user"]["credits_remaining"] == 5000 and body["user"]["tier"] == "free", body)
check("new user has credits_reset_date", body and body["user"]["credits_reset_date"] is not None)
access = body["access"]

st, body, _ = call("POST", f"{DJ}/api/auth/register/", {"username": uname, "email": "other@example.com", "password": "Str0ngPassw0rd!", "confirm_password": "Str0ngPassw0rd!"})
check("duplicate username rejected 400", st == 400 and "username" in body["detail"], (st, body))
st, body, _ = call("POST", f"{DJ}/api/auth/register/", {"username": uname + "x", "email": email, "password": "Str0ngPassw0rd!", "confirm_password": "Str0ngPassw0rd!"})
check("duplicate email rejected 400", st == 400 and "email" in body["detail"], (st, body))
st, body, _ = call("POST", f"{DJ}/api/auth/register/", {"username": uname + "y", "email": "y" + email, "password": "Str0ngPassw0rd!", "confirm_password": "nope"})
check("password mismatch rejected 400", st == 400 and "confirm_password" in body["detail"], (st, body))

print("\n=== 2. Login + JWT claims ===")
st, body, _ = call("POST", f"{DJ}/api/auth/token/", {"username": uname, "password": "Str0ngPassw0rd!"})
check("login 200", st == 200 and "access" in body, (st, body))
access = body["access"]
refresh = body["refresh"]
pl = jwt_payload(access)
check("JWT has tier/credits claims, no role", pl.get("tier") == "free" and pl.get("credits_limit") == 5000 and pl.get("voice_clone_limit") == 3 and "role" not in pl, pl)
st, body, _ = call("POST", f"{DJ}/api/auth/token/refresh/", {"refresh": refresh})
check("refresh 200", st == 200 and "access" in body, (st, body))
st, body, _ = call("POST", f"{DJ}/api/auth/token/verify/", {"token": access})
check("verify 200", st == 200, (st, body))

print("\n=== 3. Profile ===")
st, prof, _ = call("GET", f"{DJ}/api/user/profile/", token=access)
check("profile GET 200 with all fields", st == 200 and all(k in prof for k in ["id", "username", "email", "tier", "credits_used", "credits_limit", "credits_remaining", "voice_clone_limit", "voices_used", "date_joined", "credits_reset_date"]), (st, prof))
st, body, _ = call("PATCH", f"{DJ}/api/user/profile/", {"username": uname + "_renamed", "tier": "scale", "credits_used": 0}, token=access)
check("profile PATCH renames, ignores tier", st == 200 and body["username"] == uname + "_renamed" and body["tier"] == "free", (st, body))
st, body, _ = call("PATCH", f"{DJ}/api/user/profile/", {"email": "admin@agiletechstudio.com"}, token=access)
check("profile PATCH rejects taken email", st == 400, (st, body))
st, body, _ = call("GET", f"{DJ}/api/user/profile/")
check("profile requires auth (401)", st == 401, st)

print("\n=== 4. Voices ===")
st, voices, _ = call("GET", f"{DJ}/api/voice-models/", token=access)
defaults = [v for v in voices["results"] if v["is_default"]]
check("voice list has 2 default voices, none custom", st == 200 and len(defaults) == 2 and voices["count"] == 2, (st, voices))
check("voice list reports voices_used/limit", voices.get("voices_used") == 0 and voices.get("voice_clone_limit") == 3, voices)
check("default voices have preview audio_url", all(v["audio_url"] for v in defaults))
aria = next(v for v in defaults if v["display_name"].startswith("Aria"))
marcus = next(v for v in defaults if v["display_name"].startswith("Marcus"))
st, body, _ = call("DELETE", f"{DJ}/api/voice-models/{aria['id']}/", token=access)
check("default voice cannot be deleted (403)", st == 403 and body["error"] == "cannot_delete_default", (st, body))
st, body, _ = call("POST", f"{DJ}/api/voice-models/{marcus['id']}/activate/", token=access)
check("activate default voice 200", st == 200 and body["is_active"] is True, (st, body))

print("\n=== 5. Generation + credits ===")
text = "Hello from VoiceClone. This is an end to end test."
st, gen, _ = call("POST", f"{FA}/api/generate/", {"text": text, "voice_model_id": aria["id"]}, token=access)
check("generate 202 with credits_charged", st == 202 and gen["credits_charged"] == len(text) and gen["credits_remaining"] == 5000 - len(text), (st, gen))
st, prof, _ = call("GET", f"{DJ}/api/user/profile/", token=access)
check("profile credits_used deducted", prof["credits_used"] == len(text) and prof["credits_remaining"] == 5000 - len(text), prof)

status = None
for i in range(90):
    st, sb, _ = call("GET", f"{FA}/api/generate/status/{gen['job_id']}/", token=access)
    status = sb["status"]
    if status != "processing":
        break
    time.sleep(2)
check("generation reaches ready", status == "ready", (status, sb))
prompt_id = gen["prompt_id"]

print("\n=== 6. History ===")
st, hist, _ = call("GET", f"{DJ}/api/prompts/", token=access)
check("history lists only own generation", st == 200 and hist["count"] == 1 and hist["results"][0]["id"] == prompt_id, (st, hist.get("count")))
check("history item has credits_used + voice", hist["results"][0]["credits_used"] == len(text) and hist["results"][0]["voice_model"]["display_name"].startswith("Aria"), hist["results"][0])
st, det, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/", token=access)
check("detail 200 with audio_url", st == 200 and det["audio_url"], (st, det))
st, det2, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/", token=access)
# another user must not see it
u2 = "second_" + uuid.uuid4().hex[:6]
st, body, _ = call("POST", f"{DJ}/api/auth/register/", {"username": u2, "email": f"{u2}@example.com", "password": "Str0ngPassw0rd!", "confirm_password": "Str0ngPassw0rd!"})
sara_token = body.get("access") if st == 201 else None
if sara_token:
    st, body, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/", token=sara_token)
    check("other user cannot see generation (404)", st == 404, (st, body))
else:
    print("  (skip) sara login failed; trying admin fixtures password")

print("\n=== 7. Download ===")
st, dl, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/download/?format=wav&as=json", token=access)
check("download wav json 200", st == 200 and dl["download_url"].startswith("http://localhost:9000"), (st, dl))
st, blob, ctype = call("GET", dl["download_url"])
check("wav download link works", st == 200 and len(blob) > 1000 and "audio/wav" in ctype, (st, ctype, len(blob) if blob else 0))
st, dl, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/download/?format=mp3&as=json", token=access)
check("download mp3 json 200 (transcode)", st == 200 and dl["filename"].endswith(".mp3"), (st, dl))
st, blob, ctype = call("GET", dl["download_url"])
check("mp3 download link works", st == 200 and len(blob) > 1000 and "audio/mpeg" in ctype and blob[:3] in (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"), (st, ctype, blob[:4] if blob else None))
req = urllib.request.Request(f"{DJ}/api/prompts/{prompt_id}/download/?format=mp3", headers={"Authorization": f"Bearer {access}"})
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
opener = urllib.request.build_opener(NoRedirect)
try:
    opener.open(req)
    check("download redirects (302)", False, "no redirect")
except urllib.error.HTTPError as e:
    check("download redirects (302)", e.code == 302 and "localhost:9000" in e.headers.get("Location", ""), (e.code, e.headers.get("Location")))
st, body, _ = call("GET", f"{DJ}/api/prompts/{prompt_id}/download/?format=ogg", token=access)
check("bad format 400", st == 400, st)

print("\n=== 8. Insufficient credits ===")
st, body, _ = call("PATCH", f"{DJ}/api/user/credits/deduct/", {"user_id": prof["id"], "amount": 10})
check("internal deduct without token is 403", st == 403, (st, body))
remaining = 5000 - len(text)
st, body, _ = call("PATCH", f"{DJ}/api/user/credits/deduct/", {"user_id": prof["id"], "amount": remaining - 5}, headers={"X-Internal-Token": INTERNAL_TOKEN})
check("internal deduct with token 200", st == 200 and body["credits_remaining"] == 5, (st, body))
st, body, _ = call("POST", f"{FA}/api/generate/", {"text": "This text is longer than five credits.", "voice_model_id": aria["id"]}, token=access)
check("generate over budget -> 402 insufficient_credits", st == 402 and body["detail"]["error"] == "insufficient_credits", (st, body))
st, body, _ = call("PATCH", f"{DJ}/api/user/credits/deduct/", {"user_id": prof["id"], "amount": 6}, headers={"X-Internal-Token": INTERNAL_TOKEN})
check("internal deduct over budget -> 402", st == 402, (st, body))
st, hist, _ = call("GET", f"{DJ}/api/prompts/", token=access)
check("failed generate left no history row", hist["count"] == 1, hist["count"])
st, body, _ = call("POST", f"{FA}/api/generate/", {"text": "x" * 5001, "voice_model_id": aria["id"]}, token=access)
check("text over 5000 chars -> 422", st == 422, st)

print("\n=== 9. Voice limit ===")
wav = open(sys.argv[1], "rb").read() if len(sys.argv) > 1 else None
uploaded = []
if wav:
    for i in range(3):
        raw, ct = multipart({"display_name": f"Limit Test {i}", "language": "english"}, "audio_file", "clip.wav", wav)
        st, body, _ = call("POST", f"{DJ}/api/voice-models/upload/", raw=raw, content_type=ct, token=access)
        check(f"upload voice #{i+1} 202", st == 202 and body["status"] == "processing" and body["is_owner"] is True, (st, body))
        if st == 202:
            uploaded.append(body["id"])
    raw, ct = multipart({"display_name": "Limit Test 4", "language": "english"}, "audio_file", "clip.wav", wav)
    st, body, _ = call("POST", f"{DJ}/api/voice-models/upload/", raw=raw, content_type=ct, token=access)
    check("4th upload -> 403 voice_limit_reached", st == 403 and body["error"] == "voice_limit_reached", (st, body))
    st, voices, _ = call("GET", f"{DJ}/api/voice-models/", token=access)
    check("voice list shows 3/3 used", voices["voices_used"] == 3 and voices["count"] == 5, (voices["voices_used"], voices["count"]))
    raw, ct = multipart({"display_name": "Urdu", "language": "urdu"}, "audio_file", "clip.wav", wav)
    st, body, _ = call("POST", f"{DJ}/api/voice-models/upload/", raw=raw, content_type=ct, token=access)
    check("urdu without transcript -> 400 or 403 (limit hit first)", st in (400, 403), (st, body))
    # other user cannot see / delete them
    if sara_token:
        st, body, _ = call("DELETE", f"{DJ}/api/voice-models/{uploaded[0]}/", token=sara_token)
        check("other user cannot delete my voice (404)", st == 404, (st, body))
    # wait for processing to settle before deleting (worker may still be transcribing)
    for vid in uploaded:
        for _ in range(60):
            st, v, _ = call("GET", f"{DJ}/api/voice-models/{vid}/", token=access)
            if v["status"] != "processing":
                break
            time.sleep(2)
        print(f"    voice {vid[:8]} -> {v['status']} {('(' + str(v.get('error_detail'))[:80] + ')') if v['status']=='failed' else ''}")
    for vid in uploaded:
        st, body, _ = call("DELETE", f"{DJ}/api/voice-models/{vid}/", token=access)
        check(f"delete own voice {vid[:8]} 204", st == 204, (st, body))
    st, voices, _ = call("GET", f"{DJ}/api/voice-models/", token=access)
    check("voices_used back to 0", voices["voices_used"] == 0, voices["voices_used"])
else:
    print("  (skip) no wav path given")

print("\n=== 10. Delete generation / old endpoints ===")
if sara_token:
    st, body, _ = call("DELETE", f"{DJ}/api/prompts/{prompt_id}/delete/", token=sara_token)
    check("other user cannot delete generation (404)", st == 404, (st, body))
st, body, _ = call("POST", f"{DJ}/api/prompts/{prompt_id}/approve/", token=access)
check("approve endpoint gone (404)", st == 404, st)
st, body, _ = call("POST", f"{DJ}/api/prompts/{prompt_id}/export/", token=access)
check("export endpoint gone (404)", st == 404, st)
st, body, _ = call("GET", f"{DJ}/api/audit/", token=access)
check("audit endpoint gone (404)", st == 404, st)
st, body, _ = call("DELETE", f"{DJ}/api/prompts/{prompt_id}/delete/", token=access)
check("delete own generation 204", st == 204, (st, body))
st, hist, _ = call("GET", f"{DJ}/api/prompts/", token=access)
check("history empty after delete", hist["count"] == 0, hist["count"])

print(f"\n{'='*40}\nPASSED: {len(PASSED)}   FAILED: {len(FAILED)}")
for f in FAILED:
    print("  FAILED:", f)
sys.exit(1 if FAILED else 0)
