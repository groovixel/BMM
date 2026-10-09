"""
Comprehensive backend API tests for BDS Marvel.
Tests the two NEW endpoints (sample-requests, product-inquiries) plus existing endpoints.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

# Use the public backend URL from environment
BASE_URL = "https://github-import-161.preview.emergentagent.com"
API = f"{BASE_URL}/api"
RUN = uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def api_client():
    """Shared HTTP client for all tests."""
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


# ============================================================================
# NEW ENDPOINT TESTS: POST /api/sample-requests
# ============================================================================

def test_sample_request_happy_path_full_payload(api_client):
    """Happy path: POST sample-request with all fields (required + optional)."""
    payload = {
        "product": "Carrara White Marble Tiles 24x24",
        "brand": "Italian Stone Co",
        "name": f"TEST_Sample_Full_{RUN}",
        "email": f"sample_full_{RUN}@example.com",
        "phone": "+91-9876543210",
        "address": "123 Design Street, Architect Colony, Phase 2",
        "city": "Mumbai",
        "pincode": "400001",
        "notes": "Please send 3 samples with different finishes - polished, honed, and brushed."
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    
    created = response.json()
    # Verify all fields echoed back
    assert created["product"] == payload["product"]
    assert created["brand"] == payload["brand"]
    assert created["name"] == payload["name"]
    assert created["email"] == payload["email"]
    assert created["phone"] == payload["phone"]
    assert created["address"] == payload["address"]
    assert created["city"] == payload["city"]
    assert created["pincode"] == payload["pincode"]
    assert created["notes"] == payload["notes"]
    assert created["status"] == "requested"
    assert isinstance(created["id"], str) and len(created["id"]) > 0
    assert "created_at" in created
    assert "_id" not in created
    
    # Verify it appears in GET list
    list_response = api_client.get(f"{API}/sample-requests?limit=100")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert isinstance(listed, list)
    found = next((item for item in listed if item["id"] == created["id"]), None)
    assert found is not None, "Created sample request not found in GET list"
    assert found["product"] == payload["product"]
    assert found["status"] == "requested"


def test_sample_request_happy_path_required_only(api_client):
    """Happy path: POST sample-request with only required fields (optional fields omitted)."""
    payload = {
        "product": "Granite Slab Black Galaxy",
        "name": f"TEST_Sample_Min_{RUN}",
        "email": f"sample_min_{RUN}@example.com",
        "phone": "9876543210",
        "address": "456 Builder Avenue, Construction Zone"
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    
    created = response.json()
    assert created["product"] == payload["product"]
    assert created["name"] == payload["name"]
    assert created["email"] == payload["email"]
    assert created["phone"] == payload["phone"]
    assert created["address"] == payload["address"]
    # Optional fields should be null
    assert created["brand"] is None
    assert created["city"] is None
    assert created["pincode"] is None
    assert created["notes"] is None
    assert created["status"] == "requested"
    assert isinstance(created["id"], str)


def test_sample_request_validation_missing_required_fields(api_client):
    """Validation: missing required field 'address' should return 422."""
    payload = {
        "product": "Test Product",
        "name": "Test Name",
        "email": "test@example.com",
        "phone": "1234567890"
        # Missing 'address' - required field
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload)
    assert response.status_code == 422, f"Expected 422 for missing address, got {response.status_code}"


def test_sample_request_validation_invalid_email(api_client):
    """Validation: invalid email format should return 422."""
    payload = {
        "product": "Test Product",
        "name": "Test Name",
        "email": "not-a-valid-email",  # Invalid email
        "phone": "1234567890",
        "address": "123 Test Street"
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload)
    assert response.status_code == 422, f"Expected 422 for invalid email, got {response.status_code}"


def test_sample_request_validation_phone_too_short(api_client):
    """Validation: phone with less than 3 chars should return 422."""
    payload = {
        "product": "Test Product",
        "name": "Test Name",
        "email": "test@example.com",
        "phone": "12",  # Too short (min 3)
        "address": "123 Test Street"
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload)
    assert response.status_code == 422, f"Expected 422 for phone too short, got {response.status_code}"


def test_sample_request_validation_address_too_short(api_client):
    """Validation: address with less than 5 chars should return 422."""
    payload = {
        "product": "Test Product",
        "name": "Test Name",
        "email": "test@example.com",
        "phone": "1234567890",
        "address": "123"  # Too short (min 5)
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload)
    assert response.status_code == 422, f"Expected 422 for address too short, got {response.status_code}"


def test_sample_request_get_list_newest_first(api_client):
    """GET /api/sample-requests should return list sorted newest-first."""
    # Create two sample requests with slight delay
    payload1 = {
        "product": f"Product_First_{RUN}",
        "name": f"TEST_Order_1_{RUN}",
        "email": f"order1_{RUN}@example.com",
        "phone": "1234567890",
        "address": "123 First Street"
    }
    payload2 = {
        "product": f"Product_Second_{RUN}",
        "name": f"TEST_Order_2_{RUN}",
        "email": f"order2_{RUN}@example.com",
        "phone": "1234567890",
        "address": "456 Second Avenue"
    }
    
    resp1 = api_client.post(f"{API}/sample-requests", json=payload1, timeout=40)
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]
    
    resp2 = api_client.post(f"{API}/sample-requests", json=payload2, timeout=40)
    assert resp2.status_code == 201
    id2 = resp2.json()["id"]
    
    # Get list
    list_response = api_client.get(f"{API}/sample-requests?limit=10")
    assert list_response.status_code == 200
    listed = list_response.json()
    
    # Find positions of our two items
    positions = {item["id"]: idx for idx, item in enumerate(listed)}
    
    # Second item should appear before first (newest first)
    if id1 in positions and id2 in positions:
        assert positions[id2] < positions[id1], "List should be sorted newest-first"


# ============================================================================
# NEW ENDPOINT TESTS: POST /api/product-inquiries
# ============================================================================

def test_product_inquiry_happy_path_full_payload(api_client):
    """Happy path: POST product-inquiry with all fields (required + optional)."""
    payload = {
        "name": f"TEST_ProdInq_Full_{RUN}",
        "email": f"prodinq_full_{RUN}@example.com",
        "phone": "+91-9876543210",
        "brand": "Kajaria Tiles",
        "product": "Vitrified Floor Tiles 600x600mm",
        "quantity": "500 sq ft",
        "message": "I need a bulk quote for a residential project. Please provide pricing for 500 sq ft of vitrified tiles."
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    
    created = response.json()
    # Verify all fields echoed back
    assert created["name"] == payload["name"]
    assert created["email"] == payload["email"]
    assert created["phone"] == payload["phone"]
    assert created["brand"] == payload["brand"]
    assert created["product"] == payload["product"]
    assert created["quantity"] == payload["quantity"]
    assert created["message"] == payload["message"]
    assert isinstance(created["id"], str) and len(created["id"]) > 0
    assert "created_at" in created
    assert "_id" not in created
    
    # Verify it appears in GET list
    list_response = api_client.get(f"{API}/product-inquiries?limit=100")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert isinstance(listed, list)
    found = next((item for item in listed if item["id"] == created["id"]), None)
    assert found is not None, "Created product inquiry not found in GET list"
    assert found["brand"] == payload["brand"]
    assert found["message"] == payload["message"]


def test_product_inquiry_happy_path_required_only(api_client):
    """Happy path: POST product-inquiry with only required fields (optional fields omitted)."""
    payload = {
        "name": f"TEST_ProdInq_Min_{RUN}",
        "email": f"prodinq_min_{RUN}@example.com",
        "brand": "Asian Paints",
        "message": "Please send me the latest catalogue and price list for wall tiles."
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    
    created = response.json()
    assert created["name"] == payload["name"]
    assert created["email"] == payload["email"]
    assert created["brand"] == payload["brand"]
    assert created["message"] == payload["message"]
    # Optional fields should be null
    assert created["phone"] is None
    assert created["product"] is None
    assert created["quantity"] is None
    assert isinstance(created["id"], str)


def test_product_inquiry_validation_missing_required_field(api_client):
    """Validation: missing required field 'brand' should return 422."""
    payload = {
        "name": "Test Name",
        "email": "test@example.com",
        "message": "This is a valid message with more than 5 characters."
        # Missing 'brand' - required field
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload)
    assert response.status_code == 422, f"Expected 422 for missing brand, got {response.status_code}"


def test_product_inquiry_validation_invalid_email(api_client):
    """Validation: invalid email format should return 422."""
    payload = {
        "name": "Test Name",
        "email": "invalid-email-format",  # Invalid email
        "brand": "Test Brand",
        "message": "This is a valid message."
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload)
    assert response.status_code == 422, f"Expected 422 for invalid email, got {response.status_code}"


def test_product_inquiry_validation_message_too_short(api_client):
    """Validation: message with less than 5 chars should return 422."""
    payload = {
        "name": "Test Name",
        "email": "test@example.com",
        "brand": "Test Brand",
        "message": "Hi"  # Too short (min 5 chars)
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload)
    assert response.status_code == 422, f"Expected 422 for message too short, got {response.status_code}"


def test_product_inquiry_get_list_newest_first(api_client):
    """GET /api/product-inquiries should return list sorted newest-first."""
    # Create two product inquiries
    payload1 = {
        "name": f"TEST_ProdOrder_1_{RUN}",
        "email": f"prodorder1_{RUN}@example.com",
        "brand": "Brand First",
        "message": "First inquiry message for testing order."
    }
    payload2 = {
        "name": f"TEST_ProdOrder_2_{RUN}",
        "email": f"prodorder2_{RUN}@example.com",
        "brand": "Brand Second",
        "message": "Second inquiry message for testing order."
    }
    
    resp1 = api_client.post(f"{API}/product-inquiries", json=payload1, timeout=40)
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]
    
    resp2 = api_client.post(f"{API}/product-inquiries", json=payload2, timeout=40)
    assert resp2.status_code == 201
    id2 = resp2.json()["id"]
    
    # Get list
    list_response = api_client.get(f"{API}/product-inquiries?limit=10")
    assert list_response.status_code == 200
    listed = list_response.json()
    
    # Find positions of our two items
    positions = {item["id"]: idx for idx, item in enumerate(listed)}
    
    # Second item should appear before first (newest first)
    if id1 in positions and id2 in positions:
        assert positions[id2] < positions[id1], "List should be sorted newest-first"


# ============================================================================
# REGRESSION TESTS: Verify existing endpoints still work
# ============================================================================

def test_existing_endpoint_root_health(api_client):
    """Regression: GET /api/ should still return Hello World."""
    response = api_client.get(f"{API}/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}


def test_existing_endpoint_inquiries_get(api_client):
    """Regression: GET /api/inquiries should still work."""
    response = api_client.get(f"{API}/inquiries")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_existing_endpoint_inquiries_post(api_client):
    """Regression: POST /api/inquiries should still work."""
    payload = {
        "name": f"TEST_Regression_Inq_{RUN}",
        "email": f"regression_inq_{RUN}@example.com",
        "message": "This is a regression test inquiry to ensure existing endpoint still works."
    }
    response = api_client.post(f"{API}/inquiries", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    created = response.json()
    assert created["name"] == payload["name"]
    assert created["email"] == payload["email"]


def test_existing_endpoint_bookings_get(api_client):
    """Regression: GET /api/bookings should still work."""
    response = api_client.get(f"{API}/bookings")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_existing_endpoint_bookings_post(api_client):
    """Regression: POST /api/bookings should still work."""
    start = date.today() + timedelta(days=60)
    payload = {
        "stay": f"TEST_Regression_Stay_{RUN}",
        "name": f"TEST_Regression_Booking_{RUN}",
        "email": f"regression_booking_{RUN}@example.com",
        "check_in": start.isoformat(),
        "check_out": (start + timedelta(days=2)).isoformat(),
        "guests": 2
    }
    response = api_client.post(f"{API}/bookings", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    created = response.json()
    assert created["stay"] == payload["stay"]
    assert created["status"] == "requested"


def test_existing_endpoint_consultations_get(api_client):
    """Regression: GET /api/consultations should still work."""
    response = api_client.get(f"{API}/consultations")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_existing_endpoint_consultations_post(api_client):
    """Regression: POST /api/consultations should still work."""
    payload = {
        "name": f"TEST_Regression_Consult_{RUN}",
        "phone": "9876543210",
        "email": f"regression_consult_{RUN}@example.com",
        "service": "Interior Design Consultation",
        "requirements": "Need consultation for a 2000 sq ft residential project."
    }
    response = api_client.post(f"{API}/consultations", json=payload, timeout=40)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    created = response.json()
    assert created["name"] == payload["name"]
    assert created["service"] == payload["service"]


def test_existing_endpoint_stays_availability(api_client):
    """Regression: GET /api/stays/availability should still work."""
    response = api_client.get(f"{API}/stays/availability")
    assert response.status_code == 200
    data = response.json()
    assert "booked" in data
    assert "requested" in data
    assert isinstance(data["booked"], list)
    assert isinstance(data["requested"], list)


# ============================================================================
# EMAIL NOTIFICATION TESTS (should not cause 500/502)
# ============================================================================

def test_sample_request_email_failure_does_not_block_201(api_client):
    """
    Email notification failure should be logged but endpoint should still return 201.
    This test verifies the endpoint doesn't raise 500/502 even if email fails.
    """
    payload = {
        "product": "Test Product for Email Check",
        "name": f"TEST_Email_{RUN}",
        "email": f"email_test_{RUN}@example.com",
        "phone": "1234567890",
        "address": "123 Email Test Street"
    }
    
    response = api_client.post(f"{API}/sample-requests", json=payload, timeout=40)
    # Should return 201 even if email notification fails (failure is logged, not raised)
    assert response.status_code == 201, f"Expected 201 even with email failure, got {response.status_code}: {response.text}"


def test_product_inquiry_email_failure_does_not_block_201(api_client):
    """
    Email notification failure should be logged but endpoint should still return 201.
    This test verifies the endpoint doesn't raise 500/502 even if email fails.
    """
    payload = {
        "name": f"TEST_Email_{RUN}",
        "email": f"email_test_{RUN}@example.com",
        "brand": "Test Brand",
        "message": "This is a test message to check email notification handling."
    }
    
    response = api_client.post(f"{API}/product-inquiries", json=payload, timeout=40)
    # Should return 201 even if email notification fails (failure is logged, not raised)
    assert response.status_code == 201, f"Expected 201 even with email failure, got {response.status_code}: {response.text}"
