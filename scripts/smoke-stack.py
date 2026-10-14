"""Verify a freshly initialized disposable stack through its public gateway."""

import argparse
import http.cookiejar
import json
import secrets
import time
import urllib.error
import urllib.request


def verify(base):
    base = base.rstrip("/")
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )

    def request(path, method="GET", body=None, status=200):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(base + path, data=data, method=method)
        req.add_header("Origin", base)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            response = opener.open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            if response.status != status:
                raise RuntimeError(f"{method} {path}: {response.status}, expected {status}")
            raw = response.read()
            return json.loads(raw) if raw else None

    # Refuse to mutate any existing installation.
    if request("/api/v1/setup") != {"needsSetup": True}:
        raise RuntimeError("Smoke test requires a fresh disposable database")
    with opener.open(base + "/", timeout=10) as response:
        if response.status != 200 or b"<html" not in response.read().lower():
            raise RuntimeError("Frontend HTML did not load")
    print("PASS frontend and fresh setup status")
    password = secrets.token_urlsafe(24)
    request("/api/v1/setup", "POST", {
        "username": "smoke-owner", "password": password,
        "workspaceName": "Smoke workspace",
    }, 201)
    request("/api/v1/setup", "POST", {
        "username": "smoke-owner", "password": password,
    }, 409)
    request("/api/v1/auth/logout", "POST", status=204)
    request("/api/v1/auth/login", "POST", {
        "username": "smoke-owner", "password": password,
    })
    print("PASS setup, duplicate rejection and password sign-in")
    workspace = request("/api/v1/workspaces")["items"][0]["id"]
    root = f"/api/v1/workspaces/{workspace}"
    canvas = request(root + "/canvases", "POST", {"name": "Smoke canvas"}, 201)
    node = request(root + "/nodes", "POST", {
        "name": "Smoke router", "category": "network",
        "placeOn": {"canvasId": canvas["id"], "x": 12, "y": 34},
    }, 201)
    path = root + f'/canvases/{canvas["id"]}'
    view = request(path + "/view")
    if not any(item["id"] == node["id"] for item in view["nodes"]):
        raise RuntimeError("Created node missing from persisted view")
    result = request(path + "/operations", "POST", {
        "operations": [{"op": "shape.create", "kind": "rectangle", "x": 1, "y": 2}]
    })
    if len(result["view"]["shapes"]) != 1:
        raise RuntimeError("Operation response missing committed shape")
    print("PASS persisted canvas, node and operation response")
    started = time.monotonic()
    req = urllib.request.Request(base + root + "/events")
    req.add_header("Origin", base)
    with opener.open(req, timeout=5) as response:
        if response.headers.get_content_type() != "text/event-stream":
            raise RuntimeError("Gateway did not return SSE")
        if response.readline() != b": ok\n" or response.readline() != b"\n":
            raise RuntimeError("SSE opening comment missing")
    elapsed = time.monotonic() - started
    if elapsed >= 5:
        raise RuntimeError("SSE opening comment was delayed")
    print(f"PASS immediate SSE through gateway ({elapsed:.2f}s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Gateway URL of a disposable stack")
    verify(parser.parse_args().base_url)
