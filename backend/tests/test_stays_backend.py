"""
Backend tests for stays booking + auth.
Covers: /api/auth/register, /api/auth/login, /api/auth/me, /api/auth/refresh,
        /api/auth/logout, /api/stays/bookings, /api/stays/bookings/mine,
        /api/stays/bookings/{id}, /api/stays/availability, /api/bookings
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0]
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "mukeshkhandelwal212@gmail.com"
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

TS = str(int(time.time()))
GUEST_EMAIL = f"test_guest_{TS}@example.com"
GUEST_PASSWORD = "TestPass#2026"
GUEST_NAME = "TEST_Guest"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def guest_session(session):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={"name": GUEST_NAME, "email": GUEST_EMAIL, "password": GUEST_PASSWORD})
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    return s


# ---------------- Auth ----------------

class TestAuth:
    def test_register(self, session):
        email = f"test_guest_reg_{TS}_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/auth/register", json={"name": "TEST_Reg", "email": email, "password": "Pass#1234"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == email
        assert body["role"] == "guest"
        assert "access_token" in session.cookies.get_dict()

    def test_register_duplicate(self, session):
        email = f"test_guest_dup_{TS}@example.com"
        session.post(f"{API}/auth/register", json={"name": "TEST_Dup", "email": email, "password": "Pass#1234"})
        r = session.post(f"{API}/auth/register", json={"name": "TEST_Dup", "email": email, "password": "Pass#1234"})
        assert r.status_code == 409

    def test_login_admin_and_me(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        assert "access_token" in s.cookies.get_dict()
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN_EMAIL
        assert me.json()["role"] == "admin"

    def test_login_bad_password(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_refresh_and_logout(self, guest_session):
        r = guest_session.post(f"{API}/auth/refresh")
        assert r.status_code == 200
        r2 = guest_session.post(f"{API}/auth/logout")
        assert r2.status_code == 200


# ---------------- Stays bookings ----------------

class TestStayBookings:
    created_ids = []

    def _payload(self, mode="instant", check_in="2026-12-05", check_out="2026-12-07", stay="The Living Studio", slug="living-studio"):
        return {
            "stay": stay, "stay_slug": slug, "mode": mode,
            "check_in": check_in, "check_out": check_out,
            "adults": 2, "children": 0, "infants": 0, "pets": 0,
            "capacity": 4, "nightly": 5000,
            "name": "TEST_Guest", "email": GUEST_EMAIL,
            "phone": "+91 9999999999", "message": "test booking",
        }

    def test_booking_requires_auth(self, session):
        anon = requests.Session()
        r = anon.post(f"{API}/stays/bookings", json=self._payload())
        assert r.status_code == 401

    def test_create_instant_booking(self, guest_session):
        p = self._payload(mode="instant", check_in="2026-12-05", check_out="2026-12-07")
        # need to re-login since we logged out previously
        guest_session.post(f"{API}/auth/login", json={"email": GUEST_EMAIL, "password": GUEST_PASSWORD})
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 201, r.text
        b = r.json()
        assert b["status"] == "confirmed"
        assert b["nights"] == 2
        assert b["total"] == 2 * 5000
        assert b["reference"].startswith("BDS-")
        TestStayBookings.created_ids.append(b["id"])

    def test_create_request_booking(self, guest_session):
        p = self._payload(mode="request", check_in="2026-12-20", check_out="2026-12-22")
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "requested"
        TestStayBookings.created_ids.append(r.json()["id"])

    def test_overlap_409(self, guest_session):
        # overlap existing confirmed 2026-11-11 -> 2026-11-13
        p = self._payload(mode="instant", check_in="2026-11-12", check_out="2026-11-14")
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 409, r.text

    def test_past_date_422(self, guest_session):
        p = self._payload(check_in="2020-01-01", check_out="2020-01-03")
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 422

    def test_checkout_before_checkin_422(self, guest_session):
        p = self._payload(check_in="2026-12-10", check_out="2026-12-10")
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 422

    def test_guests_exceed_capacity_422(self, guest_session):
        p = self._payload(check_in="2026-12-28", check_out="2026-12-30")
        p["adults"] = 10
        p["capacity"] = 4
        r = guest_session.post(f"{API}/stays/bookings", json=p)
        assert r.status_code == 422

    def test_mine_lists_own_bookings(self, guest_session):
        r = guest_session.get(f"{API}/stays/bookings/mine")
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        for cid in TestStayBookings.created_ids:
            assert cid in ids

    def test_get_booking_by_id(self, guest_session):
        if not TestStayBookings.created_ids:
            pytest.skip("no bookings created")
        bid = TestStayBookings.created_ids[0]
        r = guest_session.get(f"{API}/stays/bookings/{bid}")
        assert r.status_code == 200
        assert r.json()["id"] == bid

    def test_get_booking_other_user_404(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if not TestStayBookings.created_ids:
            pytest.skip("no bookings created")
        r = s.get(f"{API}/stays/bookings/{TestStayBookings.created_ids[0]}")
        # admin is different user, booking is owned by guest => 404
        assert r.status_code == 404


# ---------------- Existing endpoints still work ----------------

class TestExistingEndpoints:
    def test_availability(self):
        r = requests.get(f"{API}/stays/availability", params={"stay": "The Living Studio"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_bookings_legacy_create(self):
        r = requests.post(f"{API}/bookings", json={
            "stay": "The Living Studio", "name": "TEST_Legacy",
            "email": f"test_legacy_{TS}@example.com", "check_in": "2026-12-15",
            "check_out": "2026-12-17", "guests": 2, "message": "test"})
        assert r.status_code in (200, 201)

    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
