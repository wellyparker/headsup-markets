#!/usr/bin/env python3
"""Headless simulator test for HeadsUp Markets (Even Hub simulator 0.9.3+).

Drives the simulator's HTTP control plane (automation port):
  1. Poll /api/console for the "[headsup] ready" marker.
  2. Screenshot the 576x288 LVGL framebuffer; assert lit pixels (alpha > 0).
  3. Send input (down/click/double_click) and assert the framebuffer
     changes between screens.
  4. Assert no console errors at boot.

Prerequisites (run in separate terminals):
  Terminal 1: npm run dev                      # Vite on :5173
  Terminal 2: evenhub-simulator http://localhost:5173 --automation-port 9898
              (under xvfb on a headless VM: xvfb-run -a evenhub-simulator ...)
  Terminal 3: python3 devtools/sim-test.py [--port 9898]

Requires Pillow (pip install pillow) for PNG parsing; falls back to a
raw byte check if Pillow is missing.
"""
import argparse
import io
import json
import sys
import time
import urllib.error
import urllib.request

READY_MARKER = "[headsup] ready"
TIMEOUT_S = 60


def get_json(base, path):
    with urllib.request.urlopen(f"{base}{path}", timeout=15) as r:
        return json.loads(r.read())


def get_bytes(base, path):
    with urllib.request.urlopen(f"{base}{path}", timeout=20) as r:
        return r.read()


def post_json(base, path, body):
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


def lit_pixels(png_bytes):
    """LVGL framebuffer is RGBA; alpha > 0 means a lit pixel."""
    try:
        from PIL import Image
    except ImportError:
        # Fallback: count non-zero bytes coarsely (PNG-compressed, so this
        # only distinguishes blank-ish from non-blank-ish).
        return sum(1 for b in png_bytes if b != 0)
    img = Image.open(io.BytesIO(png_bytes))
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return sum(1 for px in img.getdata() if px[3] > 0)


def wait_for_ready(base, timeout=TIMEOUT_S):
    deadline = time.time() + timeout
    since_id = 0
    while time.time() < deadline:
        try:
            data = get_json(base, f"/api/console?since_id={since_id}")
        except Exception as e:  # noqa: BLE001 - sim may still be booting
            print(f"  console poll failed ({e}); retrying...")
            time.sleep(1)
            continue
        for entry in data.get("entries", []):
            since_id = max(since_id, entry.get("id", 0))
            if READY_MARKER in entry.get("message", ""):
                return data
        time.sleep(0.5)
    raise TimeoutError(f"app did not log {READY_MARKER!r} within {timeout}s")


def console_errors(base):
    data = get_json(base, "/api/console")
    bad = []
    for e in data.get("entries", []):
        msg = e.get("message", "")
        lvl = str(e.get("level", "")).lower()
        if lvl in ("error",) or "error" in msg.lower() and "0 errors" not in msg.lower():
            bad.append(msg)
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9898)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    base = f"http://{args.host}:{args.port}"

    failures = []

    def check(name, ok, detail=""):
        print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")
        if not ok:
            failures.append(name)

    print("== HeadsUp Markets simulator test ==")
    try:
        pong = get_json(base, "/api/ping")
        check("simulator ping", pong in ("pong", {"message": "pong"}), f"-> {pong!r}")
    except Exception as e:  # noqa: BLE001
        check("simulator ping", False, f"-> {e}")
        print("RESULT: FAIL (simulator control plane unreachable)")
        return 1

    try:
        wait_for_ready(base)
        check("app ready marker", True)
    except TimeoutError as e:
        check("app ready marker", False, f"-> {e}")
        print("RESULT: FAIL")
        return 1

    time.sleep(1)
    boot_png = get_bytes(base, "/api/screenshot/glasses")
    boot_lit = lit_pixels(boot_png)
    check("home screen lit pixels > 100", boot_lit > 100, f"-> {boot_lit}")
    with open("/tmp/headsup-sim-home.png", "wb") as f:
        f.write(boot_png)

    # Navigate: down (move focus), click (open detail).
    post_json(base, "/api/input", {"action": "down"})
    time.sleep(0.7)
    post_json(base, "/api/input", {"action": "click"})
    time.sleep(1.0)
    detail_png = get_bytes(base, "/api/screenshot/glasses")
    detail_lit = lit_pixels(detail_png)
    check("detail screen lit pixels > 100", detail_lit > 100, f"-> {detail_lit}")
    check(
        "framebuffer changed home -> detail",
        detail_png != boot_png,
        f"(lit {boot_lit} -> {detail_lit})",
    )
    with open("/tmp/headsup-sim-detail.png", "wb") as f:
        f.write(detail_png)

    # Double-tap = back to home.
    post_json(base, "/api/input", {"action": "double_click"})
    time.sleep(1.0)
    back_png = get_bytes(base, "/api/screenshot/glasses")
    back_lit = lit_pixels(back_png)
    check("back-to-home lit pixels > 100", back_lit > 100, f"-> {back_lit}")
    check("framebuffer changed detail -> home", back_png != detail_png)

    errors = console_errors(base)
    check("no console errors", len(errors) == 0, f"-> {errors[:3]}")

    print("RESULT:", "PASS" if not failures else f"FAIL ({', '.join(failures)})")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
