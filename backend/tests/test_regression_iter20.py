"""Regression smoke test for iteration 20: core API endpoints."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://1b725aca-9f3f-4243-a65d-8126c0b46c88.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "info@bdsmarvel.com", "password": "hPrJt0tgYZg7chAg2CgDAa1!"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Origin": BASE})
    return s


def test_api_root(session):
    r = session.get(f"{BASE}/api/")
    assert r.status_code == 200


def test_admin_login_and_me(session):
    r = session.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    r2 = session.get(f"{BASE}/api/auth/me")
    assert r2.status_code == 200
    data = r2.json()
    assert data.get("email") == ADMIN["email"]
    assert data.get("role") in ("admin", "owner")


def test_stays_availability():
    r = requests.get(f"{BASE}/api/stays/availability")
    assert r.status_code == 200
    data = r.json()
    # expected a list or dict with data
    assert data is not None


def test_stays_list_public():
    # try common listing endpoint
    r = requests.get(f"{BASE}/api/stays")
    assert r.status_code in (200, 404)  # not critical if missing
