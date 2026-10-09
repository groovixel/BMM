"""Owner Dashboard backend tests (admin gating + night-requests workflow)."""
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

ADMIN_EMAIL = "info.bdsmarvel@gmail.com"
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
OLD_ADMIN_EMAIL = "mukeshkhandelwal212@gmail.com"
OLD_ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

STAY = "The Living Studio"
STAY_SLUG = "living-studio"


def _future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    assert r.json().get("role") == "admin"
    return s


@pytest.fixture(scope="session")
def guest_session():
    s = requests.Session()
    email = f"TEST_guest_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"name": "Test Guest", "email": email, "password": "GuestPass#2026"})
    assert r.status_code == 200, f"Guest register failed: {r.status_code} {r.text}"
    assert r.json().get("role") == "guest"
    return s


@pytest.fixture(scope="session")
def created_bookings():
    # mutable registry so cleanup fixture can remove them
    return []


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_session, created_bookings):
    yield
    # best-effort: cancel/remove bookings we created
    try:
        from pymongo import MongoClient
        mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        for bid in created_bookings:
            mongo[dbn].bookings.delete_one({"id": bid})
    except Exception as e:
        print(f"cleanup skipped: {e}")


# ---- Auth gating ----

class TestAdminGating:
    def test_admin_overview_unauth_401(self):
        r = requests.get(f"{API}/admin/overview")
        assert r.status_code == 401

    def test_admin_bookings_unauth_401(self):
        r = requests.get(f"{API}/admin/bookings")
        assert r.status_code == 401

    def test_admin_enquiries_unauth_401(self):
        r = requests.get(f"{API}/admin/enquiries")
        assert r.status_code == 401

    def test_legacy_bookings_unauth_401(self):
        for path in ("/bookings", "/inquiries", "/consultations", "/sample-requests", "/product-inquiries"):
            r = requests.get(f"{API}{path}")
            assert r.status_code == 401, f"{path} returned {r.status_code}"

    def test_legacy_booking_status_unauth_401(self):
        r = requests.post(f"{API}/bookings/nonexistent/status", json={"status": "confirmed"})
        assert r.status_code == 401

    def test_old_admin_demoted_to_guest(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": OLD_ADMIN_EMAIL, "password": OLD_ADMIN_PASSWORD})
        if r.status_code != 200:
            pytest.skip(f"Old admin login not available ({r.status_code})")
        assert r.json().get("role") == "guest"
        r2 = s.get(f"{API}/admin/overview")
        assert r2.status_code == 403

    def test_guest_forbidden_on_admin_overview(self, guest_session):
        r = guest_session.get(f"{API}/admin/overview")
        assert r.status_code == 403

    def test_availability_still_public(self):
        r = requests.get(f"{API}/stays/availability", params={"stay": STAY})
        assert r.status_code == 200
        data = r.json()
        assert "booked" in data and "requested" in data


# ---- Night requests workflow ----

class TestNightRequestsWorkflow:
    def test_full_workflow(self, admin_session, guest_session, created_bookings):
        # Create inquiry + consultation (public endpoints) for enquiries list
        ri = requests.post(f"{API}/inquiries", json={
            "name": "TEST Inquirer", "email": "TEST_inq@example.com",
            "message": "Testing enquiry list endpoint"})
        assert ri.status_code == 201, ri.text

        rc = requests.post(f"{API}/consultations", json={
            "name": "TEST Consult", "phone": "9999999999", "email": "TEST_c@example.com",
            "service": "Interior design", "requirements": "Testing consultation"})
        assert rc.status_code == 201, rc.text

        # Booking A - request mode
        ci_a, co_a = _future(30), _future(32)
        payload_a = {
            "stay": STAY, "stay_slug": STAY_SLUG, "mode": "request",
            "check_in": ci_a, "check_out": co_a,
            "adults": 2, "children": 0, "infants": 0, "pets": 0,
            "capacity": 4, "nightly": 28000,
            "name": "TEST Guest A", "email": "TEST_a@example.com", "phone": "9876543210",
            "message": "Please approve"}
        ra = guest_session.post(f"{API}/stays/bookings", json=payload_a)
        assert ra.status_code == 201, ra.text
        bid_a = ra.json()["id"]
        created_bookings.append(bid_a)
        assert ra.json()["status"] == "requested"

        # Admin sees it in admin/bookings
        rlist = admin_session.get(f"{API}/admin/bookings")
        assert rlist.status_code == 200
        ids = [b["id"] for b in rlist.json()]
        assert bid_a in ids
        booking_a = next(b for b in rlist.json() if b["id"] == bid_a)
        assert booking_a["status"] == "requested"
        assert booking_a["email"] == "TEST_a@example.com"
        assert booking_a["phone"] == "9876543210"

        # Approve
        rapp = admin_session.post(f"{API}/admin/bookings/{bid_a}/status", json={"status": "confirmed"})
        assert rapp.status_code == 200, rapp.text
        assert rapp.json()["status"] == "confirmed"

        # Availability now shows those dates as booked
        rav = requests.get(f"{API}/stays/availability", params={"stay": STAY})
        booked_dates = [(b["check_in"], b["check_out"]) for b in rav.json()["booked"]]
        assert (ci_a, co_a) in booked_dates

        # Overlap attempt -> 409
        overlap_payload = {**payload_a, "check_in": ci_a, "check_out": co_a, "name": "TEST Overlap"}
        rov = guest_session.post(f"{API}/stays/bookings", json=overlap_payload)
        assert rov.status_code == 409

        # Booking B - different dates, decline
        ci_b, co_b = _future(60), _future(63)
        payload_b = {**payload_a, "check_in": ci_b, "check_out": co_b,
                     "name": "TEST Guest B", "email": "TEST_b@example.com"}
        rb = guest_session.post(f"{API}/stays/bookings", json=payload_b)
        assert rb.status_code == 201, rb.text
        bid_b = rb.json()["id"]
        created_bookings.append(bid_b)

        rdec = admin_session.post(f"{API}/admin/bookings/{bid_b}/status", json={"status": "declined"})
        assert rdec.status_code == 200
        assert rdec.json()["status"] == "declined"

        # Declined should persist, not block availability
        rlist2 = admin_session.get(f"{API}/admin/bookings")
        bb = next((b for b in rlist2.json() if b["id"] == bid_b), None)
        assert bb is not None, "Declined booking should NOT be deleted"
        assert bb["status"] == "declined"

        # Same B dates should now be bookable (no 409)
        rb2 = guest_session.post(f"{API}/stays/bookings", json={**payload_b, "name": "TEST Guest B2",
                                                                  "email": "TEST_b2@example.com"})
        assert rb2.status_code == 201, f"Declined dates should be free: {rb2.status_code} {rb2.text}"
        created_bookings.append(rb2.json()["id"])
        # cancel to free them up
        admin_session.post(f"{API}/admin/bookings/{rb2.json()['id']}/status", json={"status": "cancelled"})

        # Cancel confirmed booking A -> dates free again
        rcan = admin_session.post(f"{API}/admin/bookings/{bid_a}/status", json={"status": "cancelled"})
        assert rcan.status_code == 200
        assert rcan.json()["status"] == "cancelled"

        rav2 = requests.get(f"{API}/stays/availability", params={"stay": STAY})
        booked_dates2 = [(b["check_in"], b["check_out"]) for b in rav2.json()["booked"]]
        assert (ci_a, co_a) not in booked_dates2

        # Admin enquiries endpoint
        ren = admin_session.get(f"{API}/admin/enquiries")
        assert ren.status_code == 200
        items = ren.json()
        assert len(items) >= 2
        types = {it.get("type") for it in items}
        assert "Contact" in types
        assert "Consultation" in types

        # Overview counts
        rov2 = admin_session.get(f"{API}/admin/overview")
        assert rov2.status_code == 200
        data = rov2.json()
        for k in ("pending_requests", "upcoming_stays", "total_bookings", "total_enquiries"):
            assert k in data and isinstance(data[k], int)
        assert data["total_bookings"] >= 2
        assert data["total_enquiries"] >= 2
