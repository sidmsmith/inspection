# api/index.py — Inspection v0.1.0
# Major updates: Location object type (search, putaway/inventory locks), graphical checklist fields,
# containerCondition verification on inventory lock, org draft merge on import/export
from flask import Flask, request, jsonify, send_from_directory
import json, re, os, traceback, base64
from datetime import datetime
import requests
from requests.auth import HTTPBasicAuth
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# === SECURE CONFIG (from Vercel Environment Variables) ===
USAGE_INGEST_URL = os.getenv("MANHATTAN_USAGE_INGEST_URL", "").strip()
USAGE_INGEST_SECRET = os.getenv("MANHATTAN_USAGE_INGEST_SECRET", "").strip()

AUTH_HOST = os.getenv("MANHATTAN_AUTH_HOST", "salep-auth.sce.manh.com")
API_HOST = os.getenv("MANHATTAN_API_HOST", "salep.sce.manh.com")
USERNAME_BASE = os.getenv("MANHATTAN_USERNAME_BASE", "sdtadmin@")
PASSWORD = os.getenv("MANHATTAN_PASSWORD")
CLIENT_ID = os.getenv("MANHATTAN_CLIENT_ID", "omnicomponent.1.0.0")
CLIENT_SECRET = os.getenv("MANHATTAN_SECRET")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.getenv("GITHUB_REPO", "sidmsmith/inspection").strip()
GITHUB_REF = os.getenv("GITHUB_REF", "main").strip()

# Critical: Fail fast if secrets missing
if not PASSWORD or not CLIENT_SECRET:
    raise Exception("Missing MANHATTAN_PASSWORD or MANHATTAN_SECRET environment variables")

STATUS_MAP = {
    "1000": "Requested", "2000": "Countered", "3000": "Scheduled",
    "4000": "Checked In", "8000": "Complete", "9000": "Cancelled"
}

# === HELPERS ===
def forward_usage_event(payload):
    """POST usage JSON to Manhattan app usage dashboard ingest (Neon)."""
    if not USAGE_INGEST_URL:
        print("[usage] MANHATTAN_USAGE_INGEST_URL not set; event not recorded")
        return
    headers = {"Content-Type": "application/json"}
    if USAGE_INGEST_SECRET:
        headers["Authorization"] = f"Bearer {USAGE_INGEST_SECRET}"
    try:
        requests.post(USAGE_INGEST_URL, json=payload, headers=headers, timeout=8)
    except Exception as e:
        print(f"[usage] Forward failed: {e}")

def get_manhattan_token(org):
    url = f"https://{AUTH_HOST}/oauth/token"
    username = f"{USERNAME_BASE}{org.lower()}"
    data = {
        "grant_type": "password",
        "username": username,
        "password": PASSWORD,
    }
    auth = HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    try:
        r = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            auth=auth,
            timeout=30,
            verify=False,
        )
        r.raise_for_status()
        return r.json().get("access_token")
    except:
        return None

def check_in_trailer(appt_data, headers, org):
    url = f"https://{API_HOST}/yard-management/api/yard-management/transaction/trailer/checkIn"
    headers = headers.copy()
    headers.update({
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    })
    appt_type = appt_data.get("AppointmentTypeId", "")
    trailer_info = {
        "CarrierId": appt_data.get("CarrierId"),
        "TrailerId": appt_data.get("TrailerId"),
        "EquipmentTypeId": appt_data.get("EquipmentTypeId")
    }
    # Include ConditionCodeId if provided
    condition_code = appt_data.get("ConditionCodeId")
    if condition_code:
        trailer_info["ConditionCodeId"] = condition_code

    payload = {
        "AppointmentInfo": {
            "AppointmentId": appt_data.get("AppointmentId"),
            "AppointmentTypeId": appt_type
        },
        "VisitType": appt_type,
        "TrailerInfo": trailer_info
    }
    
    # TODO: Add validation for ASN and Shipment if specified on appointment
    # If appt_data contains ASN (e.g., appt_data.get("ASN") or appt_data.get("AsnId")),
    # validate that the ASN exists in the system using the appropriate API endpoint.
    # If appt_data contains Shipment (e.g., appt_data.get("ShipmentId") or appt_data.get("Shipment")),
    # validate that the Shipment exists in the system using the appropriate API endpoint.
    # Return an error response if validation fails before proceeding with check-in.
    
    # Log the request payload (raw JSON)
    try:
        payload_json = json.dumps(payload, indent=2)
        print(f"[CHECK-IN REQUEST] URL: {url}")
        print(f"[CHECK-IN REQUEST] Organization: {org}")
        print(f"[CHECK-IN REQUEST] Appointment ID: {appt_data.get('AppointmentId')}")
        print(f"[CHECK-IN REQUEST] Raw JSON Payload Sent:")
        print(payload_json)
    except Exception as log_err:
        print(f"[CHECK-IN REQUEST] Error logging payload: {str(log_err)}")
        print(f"[CHECK-IN REQUEST] Payload (fallback): {payload}")
    
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        
        # Log the full response details
        print(f"[CHECK-IN RESPONSE] Status Code: {r.status_code}")
        print(f"[CHECK-IN RESPONSE] Response Headers: {dict(r.headers)}")
        print(f"[CHECK-IN RESPONSE] Raw Response Text (first 5000 chars):")
        print(r.text[:5000])
        
        try:
            response_json = r.json()
            print(f"[CHECK-IN RESPONSE] Parsed JSON Response:")
            print(json.dumps(response_json, indent=2))
        except Exception as json_err:
            print(f"[CHECK-IN RESPONSE] Failed to parse JSON: {str(json_err)}")
            response_json = {"raw_text": r.text[:2000]}

        if r.ok and response_json.get("success"):
            msg_list = response_json.get("messages", {}).get("Message", [])
            description = next((m.get("Description") for m in msg_list if m.get("Description")), "Check-in successful")
            print(f"[CHECK-IN SUCCESS] Message: {description}")
            return {"success": True, "message": description}
        else:
            # Log failure details
            print(f"[CHECK-IN FAILURE] Status OK: {r.ok}, Success in JSON: {response_json.get('success')}")
            err_list = response_json.get("errors", []) or response_json.get("exceptions", [])
            err_msg = err_list[0].get("message") if err_list else "Unknown error"
            print(f"[CHECK-IN FAILURE] Error Message: {err_msg}")
            print(f"[CHECK-IN FAILURE] Full Error Details:")
            print(json.dumps(response_json, indent=2))
            return {"success": False, "error": err_msg}
    except Exception as e:
        # Log exception with full traceback
        print(f"[CHECK-IN EXCEPTION] Request failed with exception:")
        print(f"[CHECK-IN EXCEPTION] Exception Type: {type(e).__name__}")
        print(f"[CHECK-IN EXCEPTION] Exception Message: {str(e)}")
        print(f"[CHECK-IN EXCEPTION] Full Traceback:")
        print(traceback.format_exc())
        return {"success": False, "error": f"Request failed: {str(e)}"}

def format_date(date_str):
    if not date_str:
        return "—"
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%m/%d %I:%M %p").lstrip("0")
    except:
        return "—"

def format_status(status_id):
    return STATUS_MAP.get(status_id, "Unknown")

def manhattan_api_headers(org, token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }

def verify_manhattan_token(org, token):
    """Confirm the session token is still valid before writing to GitHub."""
    if not org or not token:
        return False
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/conditionCode/search"
    payload = {"Query": "", "Template": {"ConditionCodeId": None}, "Size": 1, "Page": 0}
    try:
        r = requests.post(
            url,
            json=payload,
            headers=manhattan_api_headers(org, token),
            timeout=20,
            verify=False,
        )
        return r.ok
    except Exception:
        return False

def github_api_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

def github_contents_url(file_path):
    parts = GITHUB_REPO.split("/", 1)
    if len(parts) != 2:
        raise ValueError("GITHUB_REPO must be owner/repo")
    owner, repo = parts
    return f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"

def extract_record_id(record, id_field):
    """Extract a string ID from a Manhattan search result row."""
    if not record or not isinstance(record, dict):
        return None
    val = record.get(id_field)
    if val is None:
        return None
    if isinstance(val, str):
        return val.strip() or None
    if isinstance(val, dict):
        nested = val.get(id_field) or val.get("Id")
        return str(nested).strip() if nested else None
    return str(val).strip() or None

def fetch_paginated_ids(org, token, api_path, id_field, query=""):
    """Fetch record IDs only using Template + pagination.

    Manhattan payload shape (per entity), e.g. shipments:
    {
      "Query": "",
      "Size": 1000,
      "Page": 0,
      "Template": { "ShipmentId": null }
    }
    """
    url = f"https://{API_HOST}{api_path}"
    headers = manhattan_api_headers(org, token)
    ids = []
    seen = set()
    page = 0
    page_size = 1000
    while True:
        payload = {
            "Query": query,
            "Template": {id_field: None},
            "Size": page_size,
            "Page": page
        }
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        if not r.ok:
            return None, f"Failed to fetch records (HTTP {r.status_code})"
        data = r.json().get("data", [])
        if not isinstance(data, list):
            data = []
        for record in data:
            record_id = extract_record_id(record, id_field)
            if record_id and record_id not in seen:
                seen.add(record_id)
                ids.append(record_id)
        if len(data) < page_size:
            break
        page += 1
    return ids, None

def id_list_response(org, token, api_path, id_field, query=""):
    """Build a lean list response with count + ids for initial auth load."""
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    try:
        ids, err = fetch_paginated_ids(org, token, api_path, id_field, query)
        if err:
            return jsonify({"success": False, "error": err})
        return jsonify({"success": True, "count": len(ids), "ids": ids})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

def search_single_record(org, token, api_path, id_field, record_id):
    """Search for a single record by ID field."""
    url = f"https://{API_HOST}{api_path}"
    headers = manhattan_api_headers(org, token)
    payload = {
        "Query": f"{id_field}='{record_id}'",
        "Size": 1,
        "Page": 0
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        results = r.json().get("data", []) if r.ok else []
        if not isinstance(results, list):
            results = []
        return results
    except Exception:
        return []

# === API ROUTES ===
@app.route('/api/app_opened', methods=['POST'])
def app_opened():
    # Track app opened event (metadata will be added by frontend)
    return jsonify({"success": True})

@app.route('/api/usage-track', methods=['POST'])
def usage_track():
    """Record usage events via centralized dashboard ingest."""
    try:
        data = request.json
        event_name = data.get('event_name')
        metadata = data.get('metadata', {})
        
        # Must match apps_dashboard neonAppName for Inspection (inspection)
        payload = {
            "event_name": event_name,
            "app_name": "inspection",
            "app_version": "0.1.0",
            **metadata,
            "timestamp": datetime.now().isoformat()
        }
        
        forward_usage_event(payload)
        return jsonify({"success": True})
    except Exception as e:
        # Silently fail - don't interrupt user experience
        print(f"[usage] Failed to track event: {e}")
        return jsonify({"success": True})  # Return success anyway

@app.route('/api/auth', methods=['POST'])
def auth():
    org = request.json.get('org', '').strip()
    if not org:
        return jsonify({"success": False, "error": "ORG required"})
    token = get_manhattan_token(org)
    if token:
        return jsonify({"success": True, "token": token})
    return jsonify({"success": False, "error": "Auth failed"})

@app.route('/api/scheduled', methods=['POST'])
def scheduled():
    """Fetch all scheduled (non-checked-in) appointments"""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})

    url = f"https://{API_HOST}/appointment/api/appointment/appointment/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }
    # Paginate through all results
    all_appointments = []
    page = 0
    page_size = 1000
    try:
        while True:
            payload = {
                "Query": "AppointmentStatusId= 3000",
                "Template": {
                    "AppointmentId": None,
                    "ArrivalDateTime": None
                },
                "Size": page_size,
                "Page": page
            }
            r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
            if not r.ok:
                return jsonify({"success": False, "error": "Failed to fetch scheduled appointments"})
            data = r.json().get("data", [])
            all_appointments.extend(data)
            # If fewer results than page size, we've got them all
            if len(data) < page_size:
                break
            page += 1
        return jsonify({"success": True, "appointments": all_appointments})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/asns', methods=['POST'])
def asns():
    """Fetch ASN IDs only (AsnId != null)"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/receiving/api/receiving/asn/search"
    return id_list_response(org, token, path, "AsnId", "AsnId != null")

@app.route('/api/search_asn', methods=['POST'])
def search_asn():
    """Search for a specific ASN by AsnId"""
    org = request.json.get('org')
    asn_id = request.json.get('asn_id', '').strip()
    token = request.json.get('token')
    if not all([org, asn_id, token]):
        return jsonify({"success": False, "error": "Missing data"})

    url = f"https://{API_HOST}/receiving/api/receiving/asn/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }
    payload = {
        "Query": f"AsnId='{asn_id}'",
        "Size": 1,
        "Page": 0
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        results = r.json().get("data", []) if r.ok else []
    except:
        results = []

    return jsonify({
        "success": True,
        "results": results
    })

@app.route('/api/search', methods=['POST'])
def search():
    """Search for a specific appointment by AppointmentId"""
    org = request.json.get('org')
    appointment_id = request.json.get('appointment_id', '').strip()
    token = request.json.get('token')
    if not all([org, appointment_id, token]):
        return jsonify({"success": False, "error": "Missing data"})

    url = f"https://{API_HOST}/appointment/api/appointment/appointment/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }
    payload = {
        "Query": f"AppointmentId = '{appointment_id}'",
        "Size": 1,
        "Page": 0
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        results = r.json().get("data", []) if r.ok else []
    except:
        results = []

    for appt in results:
        appt['ScheduledDate'] = format_date(appt.get('PreferredDateTime'))
        appt['StatusText'] = format_status(appt.get('AppointmentStatusId'))

    return jsonify({
        "success": True,
        "results": results
    })

@app.route('/api/trailers', methods=['POST'])
def trailers():
    """Fetch trailer IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/yard-management/api/yard-management/trailerList/search"
    return id_list_response(org, token, path, "TrailerId")

@app.route('/api/search_trailer', methods=['POST'])
def search_trailer():
    org = request.json.get('org')
    trailer_id = request.json.get('trailer_id', '').strip()
    token = request.json.get('token')
    if not all([org, trailer_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/yard-management/api/yard-management/trailerList/search"
    results = search_single_record(org, token, path, "TrailerId", trailer_id)
    return jsonify({"success": True, "results": results})

@app.route('/api/purchase_orders', methods=['POST'])
def purchase_orders():
    """Fetch purchase order IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/receiving/api/receiving/purchaseOrder/search"
    return id_list_response(org, token, path, "PurchaseOrderId")

@app.route('/api/search_purchase_order', methods=['POST'])
def search_purchase_order():
    org = request.json.get('org')
    purchase_order_id = request.json.get('purchase_order_id', '').strip()
    token = request.json.get('token')
    if not all([org, purchase_order_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/receiving/api/receiving/purchaseOrder/search"
    results = search_single_record(org, token, path, "PurchaseOrderId", purchase_order_id)
    return jsonify({"success": True, "results": results})

@app.route('/api/ilpns', methods=['POST'])
def ilpns():
    """Fetch iLPN IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/dcinventory/api/dcinventory/ilpn/search"
    return id_list_response(org, token, path, "IlpnId")

@app.route('/api/search_ilpn', methods=['POST'])
def search_ilpn():
    org = request.json.get('org')
    ilpn_id = request.json.get('ilpn_id', '').strip()
    token = request.json.get('token')
    if not all([org, ilpn_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/dcinventory/api/dcinventory/ilpn/search"
    results = search_single_record(org, token, path, "IlpnId", ilpn_id)
    return jsonify({"success": True, "results": results})

@app.route('/api/olpns', methods=['POST'])
def olpns():
    """Fetch oLPN IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/pickpack/api/pickpack/olpn/search"
    return id_list_response(org, token, path, "OlpnId")

@app.route('/api/search_olpn', methods=['POST'])
def search_olpn():
    org = request.json.get('org')
    olpn_id = request.json.get('olpn_id', '').strip()
    token = request.json.get('token')
    if not all([org, olpn_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/pickpack/api/pickpack/olpn/search"
    results = search_single_record(org, token, path, "OlpnId", olpn_id)
    return jsonify({"success": True, "results": results})

@app.route('/api/shipments', methods=['POST'])
def shipments():
    """Fetch shipment IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    path = "/shipment/api/shipment/shipment/search"
    return id_list_response(org, token, path, "ShipmentId")

@app.route('/api/search_shipment', methods=['POST'])
def search_shipment():
    org = request.json.get('org')
    shipment_id = request.json.get('shipment_id', '').strip()
    token = request.json.get('token')
    if not all([org, shipment_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/shipment/api/shipment/shipment/search"
    results = search_single_record(org, token, path, "ShipmentId", shipment_id)
    return jsonify({"success": True, "results": results})


def _dcinventory_headers(token, org):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1",
    }


CONDITION_CODE_SEARCH_TEMPLATE = {
    "ConditionCodeId": "",
    "Description": "",
    "PK": "",
}


def _fetch_condition_codes_via_search(org, token):
    """Paginate dcinventory conditionCode/search — matches Manhattan UI search results."""
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/conditionCode/search"
    headers = _dcinventory_headers(token, org)
    codes = []
    seen = set()
    page = 0
    page_size = 1000
    while True:
        payload = {
            "Query": "",
            "Template": CONDITION_CODE_SEARCH_TEMPLATE,
            "Size": page_size,
            "Page": page,
        }
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        if not r.ok:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:500]}")
        items = r.json().get("data") or []
        if not isinstance(items, list):
            items = []
        for row in items:
            code_id = row.get("ConditionCodeId")
            if not code_id or code_id in seen:
                continue
            seen.add(code_id)
            codes.append({
                "ConditionCodeId": code_id,
                "Description": row.get("Description"),
                "PK": row.get("PK"),
            })
        if len(items) < page_size:
            break
        page += 1
    codes.sort(key=lambda c: (c.get("ConditionCodeId") or "").lower())
    return codes


LOCATION_SEARCH_TEMPLATE = {
    "LocationId": "",
    "DisplayLocation": "",
    "LocationTypeId": "",
    "BlockPutawayConditionId": "",
}


def _location_search_payload(query="", size=1000, page=0):
    return {
        "Query": query,
        "Template": LOCATION_SEARCH_TEMPLATE,
        "Size": size,
        "Page": page,
    }


def fetch_location_ids(org, token, query=""):
    """Fetch location IDs using dcinventory location search Template."""
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/location/search"
    headers = _dcinventory_headers(token, org)
    ids = []
    seen = set()
    page = 0
    page_size = 1000
    while True:
        payload = _location_search_payload(query=query, size=page_size, page=page)
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        if not r.ok:
            return None, f"Failed to fetch locations (HTTP {r.status_code})"
        data = r.json().get("data", [])
        if not isinstance(data, list):
            data = []
        for record in data:
            record_id = extract_record_id(record, "LocationId")
            if record_id and record_id not in seen:
                seen.add(record_id)
                ids.append(record_id)
        if len(data) < page_size:
            break
        page += 1
    return ids, None


@app.route('/api/locations', methods=['POST'])
def locations():
    """Fetch location IDs only (Query: \"\")"""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    try:
        ids, err = fetch_location_ids(org, token, "")
        if err:
            return jsonify({"success": False, "error": err})
        return jsonify({"success": True, "count": len(ids), "ids": ids})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/search_location', methods=['POST'])
def search_location():
    org = request.json.get('org')
    location_id = request.json.get('location_id', '').strip()
    token = request.json.get('token')
    if not all([org, location_id, token]):
        return jsonify({"success": False, "error": "Missing data"})
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/location/search"
    headers = _dcinventory_headers(token, org)
    payload = _location_search_payload(query=f"LocationId='{location_id}'", size=1, page=0)
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        results = r.json().get("data", []) if r.ok else []
        if not isinstance(results, list):
            results = []
        return jsonify({"success": True, "results": results})
    except Exception:
        return jsonify({"success": True, "results": []})


@app.route('/api/putaway_condition_codes', methods=['POST'])
def putaway_condition_codes():
    """Fetch putaway condition codes for location locking."""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/putawayConditionCode/search"
    try:
        codes = []
        seen = set()
        page = 0
        page_size = 1000
        while True:
            r = requests.post(
                url,
                json={"Query": "", "Size": page_size, "Page": page},
                headers=_dcinventory_headers(token, org),
                timeout=30,
                verify=False,
            )
            if not r.ok:
                return jsonify({"success": False, "error": f"HTTP {r.status_code}: {r.text[:500]}"})
            items = r.json().get("data") or []
            if not isinstance(items, list):
                items = []
            for x in items:
                code_id = x.get("PutawayConditionCodeId")
                if code_id and code_id not in seen:
                    seen.add(code_id)
                    codes.append({
                        "PutawayConditionCodeId": code_id,
                        "Description": x.get("Description"),
                    })
            if len(items) < page_size:
                break
            page += 1
        codes.sort(key=lambda c: (c.get("PutawayConditionCodeId") or "").lower())
        return jsonify({"success": True, "codes": codes})
    except Exception as e:
        print(f"[PutawayConditionCodes] Exception: {e}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/inventory_condition_codes', methods=['POST'])
def inventory_condition_codes():
    """Fetch inventory condition codes (location lock via containerCondition/import)."""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    try:
        codes = _fetch_condition_codes_via_search(org, token)
        return jsonify({"success": True, "codes": codes, "count": len(codes)})
    except Exception as e:
        print(f"[InventoryConditionCodes] Exception: {e}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/lock_location_putaway', methods=['POST'])
def lock_location_putaway():
    """Block putaway on a STORAGE location with a putaway condition code."""
    org = request.json.get('org')
    token = request.json.get('token')
    location_id = (request.json.get('location_id') or '').strip()
    putaway_condition_code = (request.json.get('putaway_condition_code') or '').strip()
    if not all([org, token, location_id, putaway_condition_code]):
        return jsonify({"success": False, "error": "Missing data"})
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/location/save"
    try:
        r = requests.post(
            url,
            json={
                "LocationId": location_id,
                "LocationTypeId": "STORAGE",
                "BlockPutawayConditionId": putaway_condition_code,
            },
            headers=_dcinventory_headers(token, org),
            timeout=30,
            verify=False,
        )
        if not r.ok:
            return jsonify({"success": False, "error": f"Putaway lock failed: HTTP {r.status_code}: {r.text[:300]}"})
        body = r.json()
        if body.get("success") is False:
            return jsonify({"success": False, "error": body.get("message") or "Putaway lock request rejected"})
        return jsonify({
            "success": True,
            "location_id": location_id,
            "putaway_condition_code": putaway_condition_code,
        })
    except Exception as e:
        print(f"[LockLocationPutaway] Exception: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


def _verify_location_inventory_lock(org, token, location_id, condition_code, container_type='LOCATION'):
    """Confirm containerCondition/import applied despite warning-style API responses."""
    url = f"https://{API_HOST}/dcinventory/api/dcinventory/containerCondition/search"
    headers = _dcinventory_headers(token, org)
    safe_location = location_id.replace("'", "''")
    safe_code = condition_code.replace("'", "''")
    query = (
        f"InventoryContainerId='{safe_location}' "
        f"and InventoryContainerTypeId='{container_type}' "
        f"and ConditionCode='{safe_code}'"
    )
    try:
        r = requests.post(
            url,
            json={"Query": query, "Size": 10, "Page": 0},
            headers=headers,
            timeout=30,
            verify=False,
        )
        if not r.ok:
            return False, None
        body = r.json()
        total = int((body.get("header") or {}).get("totalCount") or 0)
        data = body.get("data") or []
        if total > 0 and isinstance(data, list) and len(data) > 0:
            return True, body
        return False, body
    except Exception as e:
        print(f"[LockLocationInventory] Verify exception: {e}")
        return False, None


@app.route('/api/lock_location_inventory', methods=['POST'])
def lock_location_inventory():
    """Apply inventory condition code to a STORAGE location."""
    org = request.json.get('org')
    token = request.json.get('token')
    location_id = (request.json.get('location_id') or '').strip()
    condition_code = (request.json.get('condition_code') or '').strip()
    container_type = (request.json.get('inventory_container_type_id') or 'LOCATION').strip()
    if not all([org, token, location_id, condition_code]):
        return jsonify({"success": False, "error": "Missing data"})
    if not container_type:
        container_type = 'LOCATION'

    url = f"https://{API_HOST}/dcinventory/api/dcinventory/containerCondition/import"
    headers = _dcinventory_headers(token, org)
    headers["ValidatedErrorCodes"] = '{"Overrides":["DCI::106"]}'
    headers["ValidatedAllErrorCodes"] = "true"

    import_row = {
        "InventoryContainerId": location_id,
        "InventoryContainerTypeId": container_type,
        "ConditionCode": condition_code,
    }
    manhattan_payload = {"Data": [import_row]}

    try:
        print(f"[LockLocationInventory] POST {url}")
        print(f"[LockLocationInventory] Payload: {json.dumps(manhattan_payload)}")
        r = requests.post(
            url,
            json=manhattan_payload,
            headers=headers,
            timeout=30,
            verify=False,
        )

        body = {}
        if r.text and r.text.strip():
            try:
                body = r.json()
            except Exception:
                body = {}

        verified, verify_body = False, None
        if r.ok:
            verified, verify_body = _verify_location_inventory_lock(
                org, token, location_id, condition_code, container_type
            )

        if verified:
            return jsonify({
                "success": True,
                "location_id": location_id,
                "condition_code": condition_code,
                "inventory_container_type_id": container_type,
                "verified": True,
                "import_success_flag": body.get("success") if isinstance(body, dict) else None,
            })

        if not r.ok:
            return jsonify({
                "success": False,
                "error": f"Inventory lock failed: HTTP {r.status_code}: {r.text[:500]}",
                "manhattan_payload": manhattan_payload,
                "verify_body": verify_body,
            })

        if isinstance(body, dict) and body.get("success") is False:
            err = body.get("message") or body.get("rootCause") or "Inventory lock request rejected"
            if body.get("errors"):
                err = f"{err} — {body.get('errors')}"
            return jsonify({
                "success": False,
                "error": err,
                "manhattan_payload": manhattan_payload,
                "manhattan_response": body,
                "verify_body": verify_body,
            })

        return jsonify({
            "success": True,
            "location_id": location_id,
            "condition_code": condition_code,
            "inventory_container_type_id": container_type,
        })
    except Exception as e:
        print(f"[LockLocationInventory] Exception: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e),
            "manhattan_payload": manhattan_payload,
        })


@app.route('/api/condition_codes', methods=['POST'])
def condition_codes():
    """Fetch trailer condition codes"""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})

    url = f"https://{API_HOST}/yard-management/api/yard-management/trailerConditionCode/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }
    payload = {
        "Query": "",
        "Size": 9999,
        "needTotalCount": True,
        "Template": {
            "ConditionCodeId": None,
            "Description": None,
            "RemoveCurrentLocation": None
        }
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        if r.ok:
            body = r.json()
            data = body.get("data", {})
            # data may be a dict with "TrailerConditionCode" key, or a list directly
            if isinstance(data, dict):
                codes = data.get("TrailerConditionCode", [])
            elif isinstance(data, list):
                codes = data
            else:
                codes = []
            return jsonify({"success": True, "codes": codes})
        else:
            return jsonify({"success": False, "error": f"HTTP {r.status_code}: {r.text[:500]}"})
    except Exception as e:
        print(f"[ConditionCodes] Exception: {e}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/ilpn_condition_codes', methods=['POST'])
def ilpn_condition_codes():
    """Fetch inventory/LPN condition codes from conditionCode/search (same source as Location)."""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    try:
        codes = _fetch_condition_codes_via_search(org, token)
        return jsonify({"success": True, "codes": codes, "count": len(codes)})
    except Exception as e:
        print(f"[IlpnConditionCodes] Exception: {e}")
        return jsonify({"success": False, "error": str(e)})


def _coerce_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@app.route('/api/lock_ilpn', methods=['POST'])
def lock_ilpn():
    """Lock an iLPN with a condition code after inspection upload succeeds."""
    org = request.json.get('org')
    token = request.json.get('token')
    ilpn_id = (request.json.get('ilpn_id') or '').strip()
    condition_code = (request.json.get('condition_code') or '').strip()
    if not all([org, token, ilpn_id, condition_code]):
        return jsonify({"success": False, "error": "Missing data"})

    headers = _dcinventory_headers(token, org)
    admin_user = f"{USERNAME_BASE}{org.lower()}"

    try:
        search_res = requests.post(
            f"https://{API_HOST}/dcinventory/api/dcinventory/inventory/search",
            json={"Query": f"InventoryContainerId = '{ilpn_id}'", "Size": 1, "Page": 0},
            headers=headers,
            timeout=30,
            verify=False,
        )
        if not search_res.ok:
            return jsonify({"success": False, "error": f"Inventory search failed: HTTP {search_res.status_code}"})
        total_count = _coerce_int((search_res.json().get("header") or {}).get("totalCount"), 0)
        if total_count <= 0:
            return jsonify({"success": False, "error": "LPN does not exist"})

        current_res = requests.post(
            f"https://{API_HOST}/dcinventory/api/dcinventory/containerCondition/search",
            json={
                "Query": f"InventoryContainerId = {ilpn_id} and InventoryContainerTypeId = ILPN",
                "Page": 0,
            },
            headers=headers,
            timeout=30,
            verify=False,
        )
        if not current_res.ok:
            return jsonify({"success": False, "error": f"Condition search failed: HTTP {current_res.status_code}"})
        existing = current_res.json().get("data") or []
        if any(x.get("ConditionCode") == condition_code for x in existing):
            return jsonify({
                "success": False,
                "error": f"Already locked with {condition_code}",
                "already_locked": True,
            })

        lock_res = requests.post(
            f"https://{API_HOST}/dcinventory/api/dcinventory/containerCondition/save",
            json={
                "InventoryContainerTypeId": "ILPN",
                "CreatedBy": admin_user,
                "ConditionCode": condition_code,
                "OrgId": org,
                "FacilityId": f"{org}-DM1",
                "UpdatedBy": admin_user,
                "InventoryContainerId": ilpn_id,
            },
            headers=headers,
            timeout=30,
            verify=False,
        )
        if not lock_res.ok:
            return jsonify({"success": False, "error": f"Lock failed: HTTP {lock_res.status_code}: {lock_res.text[:300]}"})
        lock_body = lock_res.json()
        if lock_body.get("success") is False:
            return jsonify({"success": False, "error": lock_body.get("message") or "Lock request rejected"})
        return jsonify({"success": True, "condition_code": condition_code, "ilpn_id": ilpn_id})
    except Exception as e:
        print(f"[LockIlpn] Exception: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/equipment_types', methods=['POST'])
def equipment_types():
    """Fetch trailer equipment types"""
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})

    url = f"https://{API_HOST}/yard-management/api/yard-management/equipmentType/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1"
    }
    payload = {
        "Query": "StandardEquipmentTypeId=TRAILER",
        "Size": 9999,
        "needTotalCount": True,
        "Template": {
            "EquipmentTypeId": None,
            "Description": None
        }
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        if r.ok:
            body = r.json()
            data = body.get("data", {})
            # data may be a list directly or a dict
            if isinstance(data, dict):
                types = data.get("EquipmentType", []) or data.get("equipmentType", [])
                if not types:
                    # Try all values in case key name varies
                    for v in data.values():
                        if isinstance(v, list):
                            types = v
                            break
            elif isinstance(data, list):
                types = data
            else:
                types = []
            return jsonify({"success": True, "types": types})
        else:
            return jsonify({"success": False, "error": f"HTTP {r.status_code}: {r.text[:500]}"})
    except Exception as e:
        print(f"[EquipmentTypes] Exception: {e}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/checkin', methods=['POST'])
def checkin():
    appt = request.json.get('appt')
    org = request.json.get('org')
    token = request.json.get('token')
    if not all([appt, org, token]):
        return jsonify({"success": False, "error": "Missing data"})

    headers = {"Authorization": f"Bearer {token}"}
    result = check_in_trailer(appt, headers, org)
    return jsonify(result)


@app.route('/api/upload_signature', methods=['POST'])
def upload_signature():
    """Upload driver signature to Manhattan Document Manager for each ASN/PO"""
    data = request.json
    org = data.get('org')
    token = data.get('token')
    object_type_id = data.get('objectTypeId')  # e.g. ASN, PurchaseOrder, ILPN, Shipment
    object_id = data.get('objectId')
    filename = data.get('filename')
    file_data = data.get('fileData')  # Base64 encoded PNG
    notes = data.get('notes', '')
    document_name = data.get('documentName', 'Inspector')
    document_description = data.get('documentDescription', 'Inspection document uploaded via Inspection app')

    if not all([org, token, object_type_id, object_id, filename, file_data]):
        return jsonify({"success": False, "error": "Missing required fields"})

    url = f"https://{API_HOST}/document-manager/api/document-manager/uploadDocuments"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org.upper(),
        "selectedLocation": f"{org.upper()}-DM1"
    }
    payload = {
        "ObjectTypeId": object_type_id,
        "ObjectId": object_id,
        "DocumentCategoryId": "inspection",
        "Action": "overWrite",
        "Description": "Uploaded via Inspection",
        "DocumentManagerFiles": [{
            "FileName": filename,
            "DocumentName": document_name,
            "Description": document_description,
            "Notes": notes,
            "FileData": file_data
        }]
    }

    try:
        print(f"[DOCUMENT UPLOAD] {document_name} → {object_type_id}: {object_id}, File: {filename}")
        r = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
        print(f"[DOCUMENT UPLOAD] Status: {r.status_code}")
        print(f"[DOCUMENT UPLOAD] Response: {r.text[:2000]}")

        if r.ok:
            try:
                res_json = r.json()
                if res_json.get("success") is False:
                    err_list = res_json.get("errors", []) or res_json.get("exceptions", [])
                    err_msg = err_list[0].get("message") if err_list else "Upload failed"
                    return jsonify({"success": False, "error": err_msg})
            except:
                pass
            return jsonify({"success": True, "message": f"{document_name} uploaded for {object_type_id} {object_id}"})
        else:
            return jsonify({"success": False, "error": f"Upload failed (HTTP {r.status_code})"})
    except Exception as e:
        print(f"[DOCUMENT UPLOAD] Exception: {str(e)}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/save_checklist_config', methods=['POST'])
def save_checklist_config():
    """Commit per-ORG checklist overrides to GitHub (config/orgs/{ORG}.json)."""
    body = request.json or {}
    org = str(body.get("org", "")).strip().upper()
    token = body.get("token")
    config = body.get("config")

    if not org or not token:
        return jsonify({"success": False, "error": "Missing org or token"})
    if not isinstance(config, dict):
        return jsonify({"success": False, "error": "Missing config"})
    if not GITHUB_TOKEN:
        return jsonify({
            "success": False,
            "error": "Save not configured — set GITHUB_TOKEN on the server (Vercel env)"
        })
    if not verify_manhattan_token(org, token):
        return jsonify({"success": False, "error": "Session expired — authenticate again"})

    file_path = f"config/orgs/{org}.json"
    checklists = config.get("checklists") if isinstance(config.get("checklists"), dict) else {}
    commit_message = f"Checklist config: update {org} (admin v0.1)"

    try:
        gh_headers = github_api_headers()
        get_url = f"{github_contents_url(file_path)}?ref={GITHUB_REF}"
        existing_sha = None
        gr = requests.get(get_url, headers=gh_headers, timeout=30)
        if gr.status_code == 200:
            existing_sha = gr.json().get("sha")
        elif gr.status_code != 404:
            return jsonify({
                "success": False,
                "error": f"GitHub read failed (HTTP {gr.status_code})"
            })

        if not checklists:
            if not existing_sha:
                return jsonify({
                    "success": True,
                    "message": f"No overrides for {org} — nothing to save",
                    "deleted": False,
                })
            dr = requests.delete(
                github_contents_url(file_path),
                headers=gh_headers,
                json={
                    "message": f"Checklist config: remove {org} overrides (admin v0.1)",
                    "sha": existing_sha,
                    "branch": GITHUB_REF,
                },
                timeout=30,
            )
            if not dr.ok:
                return jsonify({
                    "success": False,
                    "error": f"GitHub delete failed (HTTP {dr.status_code})"
                })
            return jsonify({
                "success": True,
                "message": f"Removed {org} overrides — Vercel will redeploy shortly",
                "deleted": True,
            })

        save_doc = {
            "org": org,
            "updatedAt": config.get("updatedAt") or datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "checklists": checklists,
        }
        content_text = json.dumps(save_doc, indent=2, ensure_ascii=False) + "\n"
        payload = {
            "message": commit_message,
            "content": base64.b64encode(content_text.encode("utf-8")).decode("ascii"),
            "branch": GITHUB_REF,
        }
        if existing_sha:
            payload["sha"] = existing_sha

        pr = requests.put(
            github_contents_url(file_path),
            headers=gh_headers,
            json=payload,
            timeout=30,
        )
        if not pr.ok:
            detail = pr.text.replace("\n", " ").strip()[:200]
            return jsonify({
                "success": False,
                "error": f"GitHub save failed (HTTP {pr.status_code}): {detail}"
            })

        commit_sha = pr.json().get("commit", {}).get("sha")
        return jsonify({
            "success": True,
            "message": f"Saved {org} checklist config — Please wait 1 minute to use checklist",
            "commit": commit_sha,
            "path": file_path,
        })
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)})
    except Exception as e:
        print(f"[CHECKLIST SAVE] Exception: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)})


@app.route('/config/<path:filename>')
def serve_config(filename):
    try:
        return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'config'), filename)
    except Exception:
        return "File not found", 404

# === FALLBACK: Serve index.html for SPA (Critical for Vercel) ===
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return "API route not found", 404
    # Don't serve index.html for JavaScript files that don't exist - return 404 instead
    if path.endswith('.js'):
        return jsonify({'error': 'File not found'}), 404
    try:
        return send_from_directory('..', 'index.html')
    except:
        return "File not found", 404

# === DEV SERVER ===
if __name__ == '__main__':
    app.run(port=5000, debug=True)