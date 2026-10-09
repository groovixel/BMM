"""Smoke test for freshly imported BDS Marvel app (iteration 13)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_api_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_admin_login(session):
    r = session.post(f"{API}/auth/login", json={
        "email": "admin@bdsmarvel.com", "password": os.environ["ADMIN_PASSWORD"]
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "admin@bdsmarvel.com"
    assert data["role"] == "admin"


def test_auth_me_after_login(session):
    r = session.post(f"{API}/auth/login", json={
        "email": "admin@bdsmarvel.com", "password": os.environ["ADMIN_PASSWORD"]
    })
    assert r.status_code == 200
    r2 = session.get(f"{API}/auth/me")
    assert r2.status_code == 200
    assert r2.json()["role"] == "admin"


def test_admin_overview(session):
    session.post(f"{API}/auth/login", json={
        "email": "admin@bdsmarvel.com", "password": os.environ["ADMIN_PASSWORD"]
    })
    r = session.get(f"{API}/admin/overview")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict)


def test_create_inquiry_and_persist(session):
    uniq = f"TEST_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": f"TEST User {uniq}",
        "email": f"{uniq}@example.com",
        "message": "Smoke test inquiry",
    }
    r = requests.post(f"{API}/inquiries", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == payload["email"]
    assert body["name"] == payload["name"]
    assert "id" in body


def test_stays_availability(session):
    r = requests.get(f"{API}/stays/availability", params={
        "check_in": "2026-03-01", "check_out": "2026-03-05"
    })
    # Must not 500
    assert r.status_code in (200, 400, 422), r.text


def test_auth_status(session):
    r = requests.get(f"{API}/auth/status")
    assert r.status_code == 200
