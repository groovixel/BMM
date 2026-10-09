"""BDSM import verification tests covering health, auth, inquiries, stays, admin."""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "info.bdsmarvel@gmail.com")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
STAY = "The Living Studio"
STAY_SLUG = "living-studio"


def _future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def guest_session():
    s = requests.Session()
    email = f"TEST_guest_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST Guest", "email": email, "password": "GuestPass#2026"})
    assert r.status_code == 200, f"Guest register failed: {r.status_code} {r.text}"
    s._email = email
    return s


# ---- Health ----
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json() == {"message": "Hello World"}


# ---- Auth ----
class TestAuth:
    def test_register_sets_cookie_and_role(self):
        s = requests.Session()
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"name": "TEST Reg", "email": email, "password": "Pass#1234"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"].lower() == email.lower()
        assert body["role"] == "guest"
        assert "access_token" in s.cookies.get_dict()

    def test_admin_login_role(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---- Inquiries ----
class TestInquiries:
    def test_create_inquiry_public(self):
        r = requests.post(f"{API}/inquiries", json={
            "name": "TEST Inquirer", "email": "TEST_inq@example.com",
            "message": "Testing import inquiry"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body.get("name") == "TEST Inquirer"

    def test_inquiries_list_unauth_401(self):
        r = requests.get(f"{API}/inquiries")
        assert r.status_code == 401

    def test_inquiries_list_admin_200(self, admin_session):
        r = admin_session.get(f"{API}/inquiries")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---- Stays ----
class TestStays:
    def test_availability_shape(self):
        r = requests.get(f"{API}/stays/availability")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("booked"), list)
        assert isinstance(data.get("requested"), list)

    def test_create_booking_authed_and_overlap(self, guest_session):
        ci, co = _future(45), _future(47)
        payload = {
            "stay": STAY, "stay_slug": STAY_SLUG, "mode": "instant",
            "check_in": ci, "check_out": co,
            "adults": 2, "children": 0, "infants": 0, "pets": 0,
            "capacity": 4, "nightly": 28000,
            "name": "TEST Guest", "email": guest_session._email, "phone": "9876543210",
            "message": "import test"}
        r = guest_session.post(f"{API}/stays/bookings", json=payload)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "confirmed"
        assert body["reference"].startswith("BDS-")
        pytest.booking_id = body["id"]

        # Overlap -> 409
        r2 = guest_session.post(f"{API}/stays/bookings", json=payload)
        assert r2.status_code == 409

    def test_booking_requires_auth(self):
        ci, co = _future(80), _future(82)
        payload = {"stay": STAY, "stay_slug": STAY_SLUG, "mode": "instant",
                   "check_in": ci, "check_out": co, "adults": 1, "children": 0,
                   "infants": 0, "pets": 0, "capacity": 4, "nightly": 28000,
                   "name": "x", "email": "x@x.com", "phone": "1", "message": "x"}
        r = requests.post(f"{API}/stays/bookings", json=payload)
        assert r.status_code == 401


# ---- Admin dashboard ----
class TestAdminDashboard:
    def test_overview(self, admin_session):
        r = admin_session.get(f"{API}/admin/overview")
        assert r.status_code == 200
        data = r.json()
        for k in ("pending_requests", "upcoming_stays", "total_bookings", "total_enquiries"):
            assert k in data and isinstance(data[k], int)

    def test_bookings_list(self, admin_session):
        r = admin_session.get(f"{API}/admin/bookings")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_enquiries_list(self, admin_session):
        r = admin_session.get(f"{API}/admin/enquiries")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_overview_unauth(self):
        assert requests.get(f"{API}/admin/overview").status_code == 401


# ---- Cleanup ----
@pytest.fixture(scope="session", autouse=True)
def _cleanup(admin_session):
    yield
    try:
        bid = getattr(pytest, "booking_id", None)
        if bid:
            admin_session.post(f"{API}/admin/bookings/{bid}/status", json={"status": "cancelled"})
        from pymongo import MongoClient
        mongo = MongoClient(os.environ["MONGO_URL"])
        dbn = os.environ["DB_NAME"]
        mongo[dbn].inquiries.delete_many({"email": {"$regex": "^TEST_"}})
        mongo[dbn].bookings.delete_many({"email": {"$regex": "^TEST_"}})
    except Exception as e:
        print(f"cleanup skipped: {e}")
