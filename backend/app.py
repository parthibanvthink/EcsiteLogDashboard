from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
from Crypto.Cipher import AES
from hashlib import md5
import base64
import re
import requests
from pydantic import BaseModel
import time
import io
import zipfile
import json

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PASS_PHRASE = "ecsite"

# in-memory storage for logs
logs_storage: List[dict] = []
# in-memory storage for session summaries (rebuilt on upload)
sessions_storage: List[dict] = []

# Token caching for S3 API
_cached_auth_token: str = None
_cached_refresh_token: str = None
# ----------------- Models -----------------
class S3SiteRequest(BaseModel):
    siteId: Optional[str] = None  # Document _id
    companyId: Optional[str] = None
    companyCode: Optional[str] = None
    siteCode: Optional[str] = None  # e.g., WR_SANDBOX
    bucket_name: Optional[str] = None  # default if not provided
    site_log_path: Optional[str] = None
    timestamp_ms: Optional[str] = None
    processed_files: Optional[List[str]] = None  # List of processed file paths from /s3/process-selected-files


class ZipFileSelectionRequest(BaseModel):
    companyCode: str
    siteCode: str
    timestamp_ms: str
    selectedFiles: List[str]  # List of file paths inside the ZIP to process



# ----------------- Get Auth Token (Cached) -----------------
def get_auth_token():
    """
    Get authentication token, using cached token if available.
    Only authenticates once until server restart or token is cleared.
    """
    global _cached_auth_token, _cached_refresh_token
    
    if _cached_auth_token:
        return _cached_auth_token
    
    auth_url = "https://cloud-uat-api.ecsiteapp.com/api/users/authenticate"
    auth_payload = {
        "userName": "muthunarayani+uat2@vthink.co.in",
        "password": "Ecsite@1234"
    }
    
    auth_response = requests.post(auth_url, json=auth_payload)
    if auth_response.status_code != 200:
        raise HTTPException(status_code=auth_response.status_code, detail=f"Authentication failed: {auth_response.text}")
    
    auth_data = auth_response.json()
    auth_token = auth_data.get("accessToken")
    refresh_token = auth_data.get("refreshToken")
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="No token received from authentication")
    
    _cached_auth_token = auth_token
    _cached_refresh_token = refresh_token
    print("Authentication token cached")
    return _cached_auth_token


# ----------------- Refresh Auth Token -----------------
def refresh_auth_token():
    """
    Refresh the authentication token using the refresh token.
    Updates both accessToken and refreshToken in cache.
    """
    global _cached_auth_token, _cached_refresh_token
    
    if not _cached_refresh_token:
        # If no refresh token, do initial authentication
        return get_auth_token()
    
    refresh_url = "https://cloud-uat-api.ecsiteapp.com/api/users/refresh_token"
    refresh_payload = {
        "refreshToken": _cached_refresh_token
    }
    
    refresh_response = requests.post(refresh_url, json=refresh_payload)
    if refresh_response.status_code != 200:
        # If refresh fails, try initial authentication
        print("Refresh token failed, re-authenticating...")
        _cached_auth_token = None
        _cached_refresh_token = None
        return get_auth_token()
    
    refresh_data = refresh_response.json()
    new_access_token = refresh_data.get("accessToken")
    new_refresh_token = refresh_data.get("refreshToken")
    
    if not new_access_token:
        # If no new token, try initial authentication
        print("No new token from refresh, re-authenticating...")
        _cached_auth_token = None
        _cached_refresh_token = None
        return get_auth_token()
    
    _cached_auth_token = new_access_token
    _cached_refresh_token = new_refresh_token
    print("Token refreshed successfully")
    return _cached_auth_token


# ----------------- Check if Error is Token Expiration -----------------
def is_token_expired_error(error_detail: str) -> bool:
    """
    Check if the error indicates token expiration.
    Handles nested JSON error format from GraphQL API.
    """
    if not error_detail:
        return False
    error_lower = error_detail.lower()
    return (
        "jwt expired" in error_lower or 
        "token expired" in error_lower or 
        "UNAUTHENTICATED" in error_detail or
        "tokenexpirederror" in error_lower
    )


# ----------------- Make Authenticated Request with Auto-Refresh -----------------
def make_authenticated_request(method: str, url: str, headers: dict = None, json: dict = None, retry: bool = True):
    """
    Make an authenticated request with automatic token refresh on expiration.
    """
    auth_token = get_auth_token()
    
    if headers is None:
        headers = {}
    headers["Authorization"] = f"Bearer {auth_token}"
    headers["Content-Type"] = "application/json"
    
    response = requests.request(method, url, headers=headers, json=json)
    
    # Check if token expired
    if response.status_code != 200 and retry:
        error_detail = response.text
        if is_token_expired_error(error_detail):
            print("Token expired, refreshing...")
            # Refresh token and retry once
            new_token = refresh_auth_token()
            headers["Authorization"] = f"Bearer {new_token}"
            response = requests.request(method, url, headers=headers, json=json)
    
    return response


# ----------------- AES Decrypt -----------------
def cryptojs_decrypt(passphrase: str, ciphertext: str) -> str:
    ct = base64.b64decode(ciphertext)
    if ct[:8] != b"Salted__":
        raise ValueError("Not a valid salted CryptoJS ciphertext")
    salt = ct[8:16]
    ciphertext_bytes = ct[16:]

    d = d_i = b""
    while len(d) < 32 + 16:  # key=32, iv=16
        d_i = md5(d_i + passphrase.encode() + salt).digest()
        d += d_i
    key = d[:32]
    iv = d[32:48]

    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(ciphertext_bytes)
    pad_len = decrypted[-1]
    return decrypted[:-pad_len].decode("utf-8", errors="ignore")


# ----------------- Clear Data -----------------
@app.post("/clear-data/")
async def clear_data():
    """
    Clear all stored logs and sessions data.
    """
    global logs_storage, sessions_storage
    logs_storage.clear()
    sessions_storage.clear()
    return {"message": "All data cleared successfully"}


@app.get("/clear-file-data/")
async def clear_file_data(filename: str = Query(...)):
    """
    Clear logs and sessions data for a specific file.
    Handles both exact matches (local files) and partial matches (S3 files with full paths).
    """
    global logs_storage, sessions_storage
    
    # First try exact match
    exact_match_logs = [log for log in logs_storage if log.get("filename") == filename]
    exact_match_sessions = [session for session in sessions_storage if session.get("filename") == filename]
    
    if exact_match_logs or exact_match_sessions:
        # Exact match found - remove by exact match
        logs_storage = [log for log in logs_storage if log.get("filename") != filename]
        sessions_storage = [session for session in sessions_storage if session.get("filename") != filename]
    else:
        # No exact match - try partial match (filename ends with the provided name)
        # This handles S3 files where frontend sends short name but backend has full path
        logs_storage = [log for log in logs_storage if not log.get("filename", "").endswith(filename)]
        sessions_storage = [session for session in sessions_storage if not session.get("filename", "").endswith(filename)]
    
    return {"message": f"Data cleared for file: {filename}", "remaining_logs": len(logs_storage), "remaining_sessions": len(sessions_storage)}

# ----------------- Upload & Read Logs -----------------
@app.post("/read-log/")
async def read_log(file: UploadFile = File(...)):
    """
    Upload a file, decrypt each line, and store in memory.
    Append to existing data for session persistence.
    """
    global logs_storage, sessions_storage
    filename = file.filename  # Capture the filename
    content = await file.read()
    lines = content.decode("utf-8").splitlines()

    # Get the highest existing IDs to continue numbering
    existing_log_count = len(logs_storage)
    existing_session_count = len(sessions_storage)
    max_existing_log_id = max([log.get("id", 0) for log in logs_storage], default=0)
    max_existing_session_id = max([session.get("session_id", 0) for session in sessions_storage], default=0)
    
    device_counters: Dict[str, int] = {}
    current_device_id = None
    current_session_id = max_existing_session_id  # Continue from existing sessions
    current_session_screens: List[str] = []
    current_session_start_time = None
    last_log_time = None
    global_counter = max_existing_log_id + 1  # Continue ID numbering from existing logs

    for line in lines:
        if not line.strip():
            continue

        try:
            decrypted = cryptojs_decrypt(PASS_PHRASE, line.strip())
        except Exception as e:
            decrypted = f"ERROR: {str(e)}"

        # Detect DEVICE ID
        match = re.search(r"DEVICE ID\s+([A-Z0-9\-]+)", decrypted)
        if match:
            current_device_id = match.group(1)
            if current_device_id not in device_counters:
                device_counters[current_device_id] = 1
            continue

        # Identify session boundaries:
        # 1) Entry log point: "LOG-APP: App Version:" starts/renews a session
        # 2) Background → Active keeps same session; Background → next entry without Active means new session
        is_entry_log = "LOG-APP" in decrypted and "App Version" in decrypted
        is_background = "ECS-ACTIVITY" in decrypted and "App state background" in decrypted
        is_active = "ECS-ACTIVITY" in decrypted and "App state active" in decrypted
        is_navigate = "ECS-ACTIVITY" in decrypted and "NAVIGATE-TO" in decrypted

        if is_entry_log:
            # Start a new session
            current_session_id += 1
            current_session_screens = []
            # time will be extracted below; set start_time after parsing
            current_session_start_time = None

        # Only log if device is known
        if current_device_id:
            # Extract time at the beginning of the decrypted message if present.
            # Expected format: HH:MM:SS:MMM or HH:MM:SS:MM e.g., 07:25:03:987 or 07:25:04:07
            time_match = re.match(r"^(\d{2}:\d{2}:\d{2}:\d{2,3})", decrypted)
            extracted_time = time_match.group(1) if time_match else None

            # Remove the time and any following separators like " |" from the message for cleaner display
            if time_match:
                cleaned_message = decrypted[time_match.end():].lstrip(" |")
            else:
                cleaned_message = decrypted

            log_entry = {
                "id": global_counter,  # unique across all logs
                "device_log_id": device_counters[current_device_id],  # per-device counter
                "device_id": current_device_id,
                "time": extracted_time,  # optional precise time from decrypted line
                "message": cleaned_message,
                "session_id": current_session_id if current_session_id > 0 else 1,
                "raw": line.strip(),
                "filename": filename,  # track which file this log came from
            }
            logs_storage.append(log_entry)

            # Update session tracking metadata
            if extracted_time:
                last_log_time = extracted_time
                if current_session_start_time is None:
                    current_session_start_time = extracted_time
            if is_navigate:
                # capture screen transitions, e.g., NAVIGATE-TO : { screen : siteList }
                screen_match = re.search(r"NAVIGATE-TO\s*:\s*\{\s*screen\s*:\s*([^}\s]+)", decrypted)
                if screen_match:
                    current_session_screens.append(screen_match.group(1))

            # If a new session started on this log, finalize previous session summary
            if is_entry_log and current_session_id > 1:
                prev_session_id = current_session_id - 1
                prev_logs = [l for l in logs_storage if l["session_id"] == prev_session_id and l["device_id"] == current_device_id]
                if prev_logs:
                    sessions_storage.append({
                        "device_id": current_device_id,
                        "session_id": prev_session_id,
                        "start_time": prev_logs[0].get("time"),
                        "end_time": prev_logs[-1].get("time"),
                        "entries_count": len(prev_logs),
                        "screens": [s for s in current_session_screens[:-1]] if len(current_session_screens) > 0 else [],
                        "filename": filename,  # track which file this session came from
                    })

            # Increment counters
            device_counters[current_device_id] += 1
            global_counter += 1

    # Finalize last session summary
    if current_session_id >= 1 and current_device_id:
        last_session_logs = [l for l in logs_storage if l["session_id"] == current_session_id and l["device_id"] == current_device_id]
        if last_session_logs:
            sessions_storage.append({
                "device_id": current_device_id,
                "session_id": current_session_id,
                "start_time": last_session_logs[0].get("time"),
                "end_time": last_session_logs[-1].get("time"),
                "entries_count": len(last_session_logs),
                "screens": current_session_screens,
                "filename": filename,  # track which file this session came from
            })

    return {"message": "File processed successfully", "total_logs": len(logs_storage), "total_sessions": len(sessions_storage)}


# ----------------- Get S3 Logs -----------------
@app.post("/s3/log")
async def read_s3_log():
    try:
        # GraphQL payload for getting sites
        payload = {
            "operationName": "getSitesDocs",
            "variables": {
                "query": {"isDeleted": False},
                "sortBy": "CREATEDDATE_DESC",
                "limit": 650
            },
            "query": "query getSitesDocs($query: SiteDocQueryInput, $limit: Int, $sortBy: SiteDocSortByInput) {\n  siteDocs(query: $query, limit: $limit, sortBy: $sortBy) {\n    _id\n    companyName\n    channels\n    companyCode\n    createdBy\n    companyId\n    companyIdList\n    currentStatus\n    CustomSiteCode\n    createdDate\n    isSupportChatEnable\n    siteCompanyIdListLookup {\n      edges {\n        node {\n          companyName\n        }\n      }\n    }\n    dashboardURL {\n      isDeleted\n      _id\n      createdBy\n      createdDate\n      fileType\n      s3URI\n    }\n    siteStatus {\n      status\n    }\n    nodeId\n    nodeIdList\n    nodeIdNum\n    nodeSector\n    region\n    siteDate\n    siteId\n    siteName\n    projectId\n    siteType\n    siteIdList\n    siteIdNum\n    siteKey\n    siteName\n    latitude\n    longitude\n    siteAddress\n    startDate\n    siteProperties {\n      timeZone\n      enableSiteDashboard\n      addDynamicPhotoField\n      aflQTSSite\n      allPhotosGrid\n      approveButton\n      bomTracker\n      bomTrackerAPI\n      cableModelDynamicValues\n      chat\n      comparePhotos\n      cpiTests\n      customCables\n      dailyReportOnlySite\n      disableBranchPIM\n      disableNodeLevelCOP\n      disableSystemPIM\n      downloadZip\n      eagleViewMap\n      enableAuditLog\n      enableAutoSync\n      enableCOPReport\n      enableCustomCableAdd\n      enableForms\n      enableLoctionGroups\n      enableNodelevelCOP\n      enableNodelevelIntermediateCOP\n      enablePDFTron\n      enablePDFTronEdit\n      enableAppNodeCreation\n      enableLabelPrinting\n      enablePeriodicSync\n      enableSiteInfoUpload\n      enableSitelevelIntermediateCOP\n      enableTestTroubleshooting\n      enableVitruvi\n      erfTracker\n      erfTrackerAPI\n      floorPlan\n      formAllPhotosGrid\n      formMapView\n      formMultiTabPhotos\n      formPhotoApproval\n      formThreeSixtyPhotoGrid\n      gridTests\n      hideAllInstallTrackerPhotos\n      hideAllPhotos\n      importedFiberResult\n      installTrackerReducedLevel\n      isArchived\n      isSegmentPimChartCount\n      isSegmentSweepChartCount\n      isSystemPimChartCount\n      isSystemSweepChartCount\n      jsaTemplateURL\n      jumperTests\n      jumperTestsArchive\n      jobType\n      macroTests\n      macrosArchive\n      mandatePhotoforAntennaPIMTestsFailure\n      mandateTestPhoto\n      mandatoryPhotosOnlyForPieChart\n      manualTest\n      mapView\n      markAsTestComplete\n      markSiteasReadOnly\n      multiTabPhotos\n      nodeAddBulkUpload\n      nodeAddSiteTracker\n      nodeCOPEMEPhotoDownload\n      nodeCOPSiteTracker\n      nodeCOPSweepPIMResultPDF\n      nodeName\n      perNodeQAApproval\n      photoApproval\n      photoDownload\n      photoEdit\n      pickorderTracker\n      pickorderTrackerAPI\n      remoteToAntennaGraph\n      showActivityMessagePopup\n      showCOPLog\n      showCableLossAverage\n      showCheckInCheckOut\n      showDIYButton\n      showDailyReport\n      showDailySummary\n      showDeviceTypePopup\n      showDirectField\n      showFiberSplicer\n      showInsertionLossRxGain\n      showInstallTrackerGroup\n      showJSAForm\n      showJumperPhotosByGroup\n      showLastTestResultPDF\n      showMPilotRequest\n      showNodeSummary\n      showODASSiteCOP\n      showPhotosByGroup\n      showPreAndPostPhotoGrid\n      showResultByFloor\n      showResultByRemote\n      showSiteCustomForms\n      showSiteDocuments\n      showSiteSummary\n      showSoftDeletedTests\n      showSystemPieChart\n      showSystemPimPieChart\n      showTMOColorCode\n      showTicketList\n      showVitruviButton\n      showGISLocation\n      siteAssetTag\n      siteDashboard\n      siteLevelCOPforODAS\n      siteSpecificDynamicValuesSweep\n      skipDTPTest\n      skipJumperSweepJumperPimCount\n      skipJumpers\n      sunsightReport\n      sweepResultByFloor\n      testNotRequired\n      testSoftDelete\n      threeSixtyPhotoGrid\n      trackCableInstall\n      trackCableInstallandLength\n      useSIUnits\n      useSIUnitsinTapeDrop\n      enableResults\n      enableSweepResults\n      enablePIMResults\n      enableSegmentSweepResults\n      enableSystemSweepResults\n      showResultsByFloor\n      showResultsByRemote\n      showResultsByZone\n      enableROSL\n      enableSplicerResults\n      enableGridTest\n    }\n  }\n}"
        }

        # Use authenticated request with auto-refresh
        url = "https://cloud-uat-api.ecsiteapp.com/api/graphql"
        response = make_authenticated_request("POST", url, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        data = response.json()
        site_docs = data.get("data", {}).get("siteDocs", [])

        # Return full site documents without filtering
        return {"sites": site_docs}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Parse Test Results from Logs -----------------
def parse_test_results_from_logs(processed_files: Optional[List[str]] = None):
    """
    Parse test results from logs_storage by analyzing TESTING-INFO events.
    Counts completed, incomplete, and deleted tests per file.
    
    Returns a dictionary in the format expected by the frontend:
    {
        "testInfo": {
            "filename1": {"completed": int, "incomplete": int, "deleted": int},
            "filename2": {...}
        }
    }
    """
    # Filter logs by processed_files if provided and create filename mapping
    # Map log filenames to full S3 paths for consistent response keys
    filename_to_fullpath: Dict[str, str] = {}
    if processed_files and len(processed_files) > 0:
        filtered_logs = []
        for log in logs_storage:
            log_filename = log.get("filename", "")
            # Check if any processed_file path contains this filename
            for proc_file in processed_files:
                if log_filename in proc_file or proc_file.endswith(log_filename):
                    filtered_logs.append(log)
                    # Map the log filename to the full S3 path
                    filename_to_fullpath[log_filename] = proc_file
                    break
    else:
        filtered_logs = logs_storage
        # If no processed_files, use log filenames as-is
        for log in logs_storage:
            log_filename = log.get("filename", "unknown")
            if log_filename not in filename_to_fullpath:
                filename_to_fullpath[log_filename] = log_filename
    
    # Dictionary to track test info per file
    # Structure: {filename: {unique_test_key: {"started": bool, "completed": bool, "aborted": bool, "stopped": bool, "deleted": bool, "test_id": str}}}
    # unique_test_key combines testProfileTestItemId with a sequence number to handle multiple runs of the same test
    test_tracking: Dict[str, Dict[str, Dict]] = {}
    test_sequence_counter: Dict[str, int] = {}  # Track sequence number per test ID
    
    # Debug counters
    debug_stats = {
        "total_logs_checked": 0,
        "testing_info_found": 0,
        "details_extracted": 0,
        "info_extracted": 0,
        "test_id_extracted": 0,
        "started_found": 0,
        "completed_found": 0,
        "deleted_found": 0
    }
    
    for log in filtered_logs:
        message = log.get("message", "")
        filename = log.get("filename", "unknown")
        debug_stats["total_logs_checked"] += 1
        
        # Skip if not a TESTING-INFO message
        if "TESTING-INFO" not in message or "ECS-ACTIVITY" not in message:
            continue
        
        debug_stats["testing_info_found"] += 1
        
        # Pattern to match: TESTING-INFO : { details : Test Started/Completed/Deleted , info : {...} }
        # The actual format is: "details : Test Started , info : {...}"
        # Extract details first - be more flexible with the pattern
        # The format is: TESTING-INFO : { details : Test Started , info : {...} }
        # Try to extract everything between "details :" and the comma before "info"
        details_match = re.search(r"details\s*:\s*([^,}]+?)(?:\s*,|\s*\})", message, re.IGNORECASE | re.DOTALL)
        if not details_match:
            # Try alternative pattern - maybe no comma, just space
            details_match = re.search(r"details\s*:\s*([^}]+?)(?:\s+info\s*:|\s*\})", message, re.IGNORECASE | re.DOTALL)
        if not details_match:
            # Last resort: extract between "details :" and "info :"
            details_match = re.search(r"details\s*:\s*([^}]*?)\s+info\s*:", message, re.IGNORECASE | re.DOTALL)
        if not details_match:
            print(f"DEBUG: Could not extract details from message: {message[:300]}")
            continue
        
        details = details_match.group(1).strip()
        debug_stats["details_extracted"] += 1
        print(f"DEBUG: Extracted details: '{details}'")
        
        # Extract info JSON - find "info : {" and extract until matching closing brace
        info_start = message.find("info : {")
        if info_start == -1:
            continue
        
        # Find the matching closing brace for the info object
        brace_count = 0
        start_pos = info_start + len("info : {") - 1  # Start from the opening brace
        info_str = None
        
        for i in range(start_pos, len(message)):
            if message[i] == '{':
                brace_count += 1
            elif message[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    info_str = message[start_pos:i+1]  # Include both braces
                    break
        
        if not info_str:
            continue
        
        debug_stats["info_extracted"] += 1
        
        # Determine test status from details (case-insensitive)
        details_lower = details.lower()
        test_status = None
        if "test started" in details_lower or "started" in details_lower:
            test_status = "started"
            debug_stats["started_found"] += 1
        elif "test completed" in details_lower or "test complete" in details_lower or "completed" in details_lower:
            test_status = "completed"
            debug_stats["completed_found"] += 1
        elif "test aborted" in details_lower or "aborted" in details_lower:
            test_status = "aborted"
        elif "test stopped" in details_lower or "stopped" in details_lower:
            test_status = "stopped"
        elif "test deleted" in details_lower or "deleted" in details_lower:
            test_status = "deleted"
            debug_stats["deleted_found"] += 1
        else:
            # Debug: print what we found
            print(f"DEBUG: Unrecognized test event details: '{details}'")
            continue  # Skip if it's not a recognized test event
        
        # Parse the info JSON to extract testProfileTestItemId
        test_id = None
        try:
            # Try to parse as JSON
            info = json.loads(info_str)
            test_id = info.get("testProfileTestItemId")
            
            if not test_id:
                # Fallback: try regex extraction if JSON parsing worked but no testProfileTestItemId
                test_id_match = re.search(r'"testProfileTestItemId"\s*:\s*"([^"]+)"', info_str)
                if test_id_match:
                    test_id = test_id_match.group(1)
        except json.JSONDecodeError as e:
            # If JSON parsing fails, try to extract testProfileTestItemId using regex
            test_id_match = re.search(r'"testProfileTestItemId"\s*:\s*"([^"]+)"', info_str)
            if test_id_match:
                test_id = test_id_match.group(1)
            else:
                # Try case-insensitive search
                test_id_match = re.search(r'"testProfileTestItemId"\s*:\s*"([^"]+)"', info_str, re.IGNORECASE)
                if test_id_match:
                    test_id = test_id_match.group(1)
                else:
                    # Try without quotes around the key
                    test_id_match = re.search(r'testProfileTestItemId\s*:\s*"([^"]+)"', info_str, re.IGNORECASE)
                    if test_id_match:
                        test_id = test_id_match.group(1)
        except Exception as e:
            print(f"Error parsing test info: {e}, info_str: {info_str[:200]}")
            # Still try regex as fallback
            test_id_match = re.search(r'"testProfileTestItemId"\s*:\s*"([^"]+)"', info_str)
            if test_id_match:
                test_id = test_id_match.group(1)
        
        if not test_id:
            print(f"DEBUG: Could not extract testProfileTestItemId. Details: '{details}', Info: {info_str[:300]}")
            continue
        
        debug_stats["test_id_extracted"] += 1
        
        # Validate "Test Aborted" events - must have preceding "INFO : Aborted" log (without TESTING-INFO)
        if test_status == "aborted":
            # Find the current log's position in logs_storage to check preceding logs
            current_log_id = log.get("id")
            log_time = log.get("time", "")
            
            # Look back in logs_storage for the same file to find "INFO : Aborted" message
            has_preceding_aborted = False
            lookback_limit = 5  # Check up to 5 logs back (usually the previous event)
            
            # Find logs from the same file before this one
            file_logs = [l for l in logs_storage if l.get("filename") == filename]
            current_index = None
            for idx, file_log in enumerate(file_logs):
                if file_log.get("id") == current_log_id:
                    current_index = idx
                    break
            
            if current_index is not None:
                # Check preceding logs within lookback window
                start_idx = max(0, current_index - lookback_limit)
                for i in range(current_index - 1, start_idx - 1, -1):
                    if i < 0:
                        break
                    prev_log = file_logs[i]
                    prev_message = prev_log.get("message", "")
                    prev_time = prev_log.get("time", "")
                    
                    # Check if this is an "INFO : Aborted" message (without TESTING-INFO)
                    if "TESTING-INFO" not in prev_message and "ECS-ACTIVITY" not in prev_message:
                        # Check for "INFO : Aborted" pattern
                        if re.search(r"INFO\s*:\s*Aborted", prev_message, re.IGNORECASE):
                            has_preceding_aborted = True
                            print(f"DEBUG: Found preceding 'INFO : Aborted' at log {prev_log.get('id')} (time: {prev_time})")
                            break
                    # Stop looking if we go too far back in time (more than a few seconds)
                    # This is a heuristic to avoid checking unrelated logs
                    if prev_time and log_time:
                        # Simple check: if times are very different, stop looking
                        # (This is approximate, but should work for most cases)
                        pass
            
            if not has_preceding_aborted:
                print(f"DEBUG: 'Test Aborted' event at log {current_log_id} has no preceding 'INFO : Aborted' - SKIPPING aborted status")
                # Skip this aborted event - don't mark as aborted
                # The test will continue to be available for matching with completed/stopped events
                continue
        
        # Initialize file tracking if needed
        if filename not in test_tracking:
            test_tracking[filename] = {}
            test_sequence_counter[filename] = {}
        
        # For "Test Started" events, create a new unique test instance
        # For "Test Completed" and "Test Deleted", match to the most recent unmatched "Test Started"
        if test_status == "started":
            # Create a new test instance - use test_id + sequence number
            if test_id not in test_sequence_counter[filename]:
                test_sequence_counter[filename][test_id] = 0
            test_sequence_counter[filename][test_id] += 1
            unique_key = f"{test_id}_{test_sequence_counter[filename][test_id]}"
            
            test_tracking[filename][unique_key] = {
                "started": True,
                "completed": False,
                "aborted": False,
                "stopped": False,
                "deleted": False,
                "test_id": test_id
            }
            print(f"DEBUG: New test instance - Key: {unique_key[:60]}..., Event: 'Test Started'")
        else:
            # For completed/deleted events, find the most recent unmatched test with this ID
            # Look for the highest sequence number that hasn't been completed/deleted yet
            matching_key = None
            max_seq = 0
            
            for key, test_data in test_tracking[filename].items():
                if test_data.get("test_id") == test_id:
                    # Extract sequence number from key (format: test_id_seq)
                    if "_" in key:
                        try:
                            seq = int(key.split("_")[-1])
                            # Match to the most recent unmatched test (not completed, not aborted, not stopped, and not deleted)
                            if seq > max_seq and not test_data.get("completed", False) and not test_data.get("aborted", False) and not test_data.get("stopped", False) and not test_data.get("deleted", False):
                                max_seq = seq
                                matching_key = key
                        except ValueError:
                            pass
            
            if matching_key:
                if test_status == "completed":
                    test_tracking[filename][matching_key]["completed"] = True
                    print(f"DEBUG: Matched test completed - Key: {matching_key[:60]}...")
                elif test_status == "aborted":
                    test_tracking[filename][matching_key]["aborted"] = True
                    print(f"DEBUG: Matched test aborted - Key: {matching_key[:60]}...")
                elif test_status == "stopped":
                    test_tracking[filename][matching_key]["stopped"] = True
                    print(f"DEBUG: Matched test stopped - Key: {matching_key[:60]}...")
                elif test_status == "deleted":
                    test_tracking[filename][matching_key]["deleted"] = True
                    print(f"DEBUG: Matched test deleted - Key: {matching_key[:60]}...")
            else:
                # No matching started test found - create a new entry for deleted/completed without start
                if test_id not in test_sequence_counter[filename]:
                    test_sequence_counter[filename][test_id] = 0
                test_sequence_counter[filename][test_id] += 1
                unique_key = f"{test_id}_{test_sequence_counter[filename][test_id]}"
                
                test_tracking[filename][unique_key] = {
                    "started": False,
                    "completed": test_status == "completed",
                    "aborted": test_status == "aborted",
                    "stopped": test_status == "stopped",
                    "deleted": test_status == "deleted",
                    "test_id": test_id
                }
                print(f"DEBUG: Orphaned event (no start) - Key: {unique_key[:60]}..., Event: '{details}'")
    
    # Print debug statistics
    total_tests_tracked = sum(len(tests) for tests in test_tracking.values())
    print(f"DEBUG Test Parsing Stats: {debug_stats}")
    print(f"DEBUG Total tests tracked: {total_tests_tracked}")
    print(f"DEBUG Test tracking details: {[(f, len(t)) for f, t in test_tracking.items()]}")
    
    # Print detailed test tracking info
    for filename, tests in test_tracking.items():
        print(f"DEBUG File '{filename}' has {len(tests)} tests:")
        for test_id, test_data in tests.items():
            print(f"  - Test ID: {test_id[:36]}... | started={test_data['started']}, completed={test_data['completed']}, aborted={test_data.get('aborted', False)}, stopped={test_data.get('stopped', False)}, deleted={test_data['deleted']}")
    
    # Count tests per file, using full S3 paths as keys when available
    test_info = {}
    for filename, tests in test_tracking.items():
        completed = 0
        incomplete = 0
        aborted = 0
        deleted = 0
        
        print(f"DEBUG: Counting tests for file '{filename}':")
        for test_key, test_data in tests.items():
            is_started = test_data.get("started", False)
            is_completed = test_data.get("completed", False)
            is_aborted = test_data.get("aborted", False)
            is_stopped = test_data.get("stopped", False)
            is_deleted = test_data.get("deleted", False)
            
            # Priority order: deleted > started+completed > started+aborted > started+stopped > started+incomplete > orphaned completed
            
            # If test was deleted, count as deleted (regardless of other status)
            if is_deleted:
                deleted += 1
                print(f"  - {test_key[:50]}... -> DELETED (started={is_started}, completed={is_completed}, aborted={is_aborted}, stopped={is_stopped})")
            # Tests that started and completed (and not deleted) are completed
            elif is_started and is_completed:
                completed += 1
                print(f"  - {test_key[:50]}... -> COMPLETED")
            # Tests that started and aborted (and not deleted) are aborted
            elif is_started and is_aborted:
                aborted += 1
                print(f"  - {test_key[:50]}... -> ABORTED")
            # Tests that started and stopped (and not deleted) are incomplete
            elif is_started and is_stopped:
                incomplete += 1
                print(f"  - {test_key[:50]}... -> INCOMPLETE (stopped)")
            # Tests that started but not completed/aborted/stopped (and not deleted) are incomplete
            elif is_started and not is_completed:
                incomplete += 1
                print(f"  - {test_key[:50]}... -> INCOMPLETE")
            # Tests that completed without starting (edge case)
            elif is_completed and not is_started:
                completed += 1
                print(f"  - {test_key[:50]}... -> COMPLETED (orphaned)")
            else:
                print(f"  - {test_key[:50]}... -> UNCATEGORIZED (started={is_started}, completed={is_completed}, aborted={is_aborted}, stopped={is_stopped}, deleted={is_deleted})")
        
        print(f"DEBUG: Final counts for '{filename}': completed={completed}, incomplete={incomplete}, aborted={aborted}, deleted={deleted}, total={completed + incomplete + aborted + deleted}")
        
        # Use full S3 path as key if available, otherwise use filename
        key = filename_to_fullpath.get(filename, filename)
        test_info[key] = {
            "completed": completed,
            "incomplete": incomplete,
            "aborted": aborted,
            "deleted": deleted
        }
    
    # Ensure all processed files are included in the response, even if they have no test events
    if processed_files and len(processed_files) > 0:
        for proc_file in processed_files:
            # Check if this file is already in test_info
            if proc_file not in test_info:
                # Check if this file exists in logs_storage
                # For S3 files: proc_file might be a full path, check if any log filename matches
                # For local files: proc_file is just the filename
                file_exists = False
                matching_log_filename = None
                
                # First, check if proc_file is already mapped in filename_to_fullpath
                for log_filename, mapped_path in filename_to_fullpath.items():
                    if mapped_path == proc_file:
                        # Found a mapping, check if logs exist for this filename
                        if any(log.get("filename", "") == log_filename for log in logs_storage):
                            file_exists = True
                            matching_log_filename = log_filename
                            break
                
                # If not found in mapping, check direct matches (for local files)
                if not file_exists:
                    # Check if proc_file matches any log filename directly
                    for log in logs_storage:
                        log_filename = log.get("filename", "")
                        # For local files: exact match
                        # For S3 files: check if log_filename is in proc_file or proc_file ends with log_filename
                        if log_filename == proc_file or (log_filename in proc_file or proc_file.endswith(log_filename)):
                            file_exists = True
                            matching_log_filename = log_filename
                            # Update mapping for consistency
                            if log_filename not in filename_to_fullpath:
                                filename_to_fullpath[log_filename] = proc_file
                            break
                
                # If file exists in logs_storage, add it to test_info with zero counts
                if file_exists:
                    test_info[proc_file] = {
                        "completed": 0,
                        "incomplete": 0,
                        "aborted": 0,
                        "deleted": 0
                    }
                    print(f"DEBUG: Added file '{proc_file}' with zero counts (no test events found, matching log: {matching_log_filename})")
    else:
        # If no processed_files provided, ensure all files in logs_storage are included
        unique_filenames = set()
        for log in logs_storage:
            log_filename = log.get("filename", "")
            if log_filename and log_filename not in unique_filenames:
                unique_filenames.add(log_filename)
                # Use filename_to_fullpath mapping if available, otherwise use filename
                key = filename_to_fullpath.get(log_filename, log_filename)
                if key not in test_info:
                    test_info[key] = {
                        "completed": 0,
                        "incomplete": 0,
                        "aborted": 0,
                        "deleted": 0
                    }
                    print(f"DEBUG: Added file '{key}' with zero counts (no test events found)")
    
    return {"testInfo": test_info}


@app.post("/test-results")
async def test_results(body: Optional[S3SiteRequest] = None):
    try:
        resolved_site_id = (body.siteId if body and body.siteId else None)
        resolved_company_id = (body.companyId if body and body.companyId else None)
        resolved_company_code = (body.companyCode if body and body.companyCode else None)
        resolved_site_code = (body.siteCode if body and body.siteCode else None)
        resolved_bucket_name = (body.bucket_name if body and body.bucket_name else "ecsite-cloud-uat")
        processed_files = (body.processed_files if body and body.processed_files else None)
        
        # Check if there are any logs in storage
        if not logs_storage or len(logs_storage) == 0:
            # Return empty result structure
            result_json = {
                "data": {
                    "response": {"testInfo": {}}
                }
            }
            response_data = {
                "data": {
                    "runWorkflow": {
                        "stepResults": [
                            {
                                "stepId": "parse_logs",
                                "stepInfo": "No logs found",
                                "result": json.dumps(result_json),
                                "metricSummary": None
                            }
                        ],
                        "status": "success",
                        "message": "No logs found in storage",
                        "errorLog": None
                    }
                }
            }
            return {"message": "No logs found", "data": response_data}
        
        # Parse test results from logs_storage instead of using external API
        test_results_data = parse_test_results_from_logs(processed_files)
        
        # Format response to match what frontend expects
        # The frontend expects: apiResponse.data.data.runWorkflow.stepResults[0].result
        # Where result is a JSON string containing: { data: { response: { testInfo: {...} } } }
        result_json = {
            "data": {
                "response": test_results_data
            }
        }
        
        # Create response in the format expected by frontend
        # After axios, response.data will contain this structure
        # Frontend accesses: response.data.data.runWorkflow
        response_data = {
            "data": {
                "runWorkflow": {
                    "stepResults": [
                        {
                            "stepId": "parse_logs",
                            "stepInfo": "Parsed test results from logs",
                            "result": json.dumps(result_json),
                            "metricSummary": None
                        }
                    ],
                    "status": "success",
                    "message": "Test results parsed successfully",
                    "errorLog": None
                }
            }
        }
        
        return {"message": "Test results fetched successfully", "data": response_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ----------------- Get S3 Log Files for Site -----------------
@app.post("/s3/log/{site_id}")
async def get_s3_log_files(site_id: str, body: Optional[S3SiteRequest] = None):
    """
    Get log files for a specific site using GraphQL API.
    The payload is modified based on the selected site_id.
    """
    try:
        # Resolve inputs (prefer body values, fall back to path param where appropriate)
        resolved_site_id = (body.siteId if body and body.siteId else site_id)
        resolved_company_id = (body.companyId if body and body.companyId else None)
        resolved_company_code = (body.companyCode if body and body.companyCode else None)
        resolved_site_code = (body.siteCode if body and body.siteCode else None)
        resolved_bucket_name = (body.bucket_name if body and body.bucket_name else "ecsite-cloud-uat")

        # Validate required fields
        if not resolved_company_id or not resolved_company_code or not resolved_site_code:
            raise HTTPException(status_code=400, detail="companyId, companyCode, and siteCode are required in request body")

        # GraphQL payload for fetching log files for a specific site
        payload = {
            "operationName": "runWorkflow",
            "variables": {
                "data": {
                    "isAsync": False,
                    "siteId": resolved_site_id,
                    "companyId": resolved_company_id,
                    "userArgs": [
                        {
                            "name": "bucket_name",
                            "value": f"str('{resolved_bucket_name}')"
                        },
                        {
                            "name": "companyCode",
                            "value": f"str('{resolved_company_code}')"
                        },
                        {
                            "name": "siteCode",
                            "value": f"str('{resolved_site_code}')"
                        }
                    ],
                    "rawSteps": [
                        {
                            "job_type": "support_decrypt",
                            "_id": "support_decrypt",
                            "returnResult": True,
                            "input": {
                                "companyCode": "{args.companyCode}",
                                "siteCode": "{args.siteCode}",
                                "bucket_name": "{args.bucket_name}"
                            }
                        }
                    ]
                }
            },
            "query": "mutation runWorkflow($data: WorkflowInput!) {\n  runWorkflow(data: $data) {\n    stepResults {\n      stepId\n      stepInfo\n      result\n      metricSummary\n    }\n    status\n    message\n    errorLog {\n      error\n      function\n      traceback\n    }\n  }\n}"
        }

        # Use authenticated request with auto-refresh
        url = "https://cloud-uat-api.ecsiteapp.com/api/graphql"
        response = make_authenticated_request("POST", url, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        data = response.json()
        
        # Return the GraphQL response data
        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Generate S3 Log Files for Site -----------------
@app.post("/s3/log/{site_id}/generate")
async def generate_s3_log_files(site_id: str, body: Optional[S3SiteRequest] = None):
    """
    Get log files for a specific site using GraphQL API.
    The payload is modified based on the selected site_id.
    """
    try:
        # Resolve inputs (prefer body values, fall back to path param where appropriate)
        resolved_site_id = (body.siteId if body and body.siteId else site_id)
        resolved_company_id = (body.companyId if body and body.companyId else None)
        resolved_company_code = (body.companyCode if body and body.companyCode else None)
        resolved_site_code = (body.siteCode if body and body.siteCode else None)
        resolved_bucket_name = (body.bucket_name if body and body.bucket_name else "ecsite-cloud-uat")
        resolved_decrypt_key = ("ecsite")
        resolved_site_log_path = (body.site_log_path if body and body.site_log_path else None)
        timestamp_ms = (body.timestamp_ms if body and body.timestamp_ms else None)
        print("timestamp12345", timestamp_ms)
        # Use siteCode for S3 path to match download URL format
        resolved_target_path = f"{resolved_company_code}/{resolved_site_code}/ecsOpsTool/decrypted_{timestamp_ms}/"

        # Validate required fields
        if not resolved_company_id or not resolved_company_code or not resolved_site_code:
            raise HTTPException(status_code=400, detail="companyId, companyCode, and siteCode are required in request body")

        # GraphQL payload for fetching log files for a specific site
        payload = {
            "operationName": "runWorkflow",
            "variables": {
                "data": {
                    "siteId": resolved_site_id,
                    "companyId": resolved_company_id,
                    "userArgs": [
                        {
                            "name": "bucket_name",
                            "value": f"str('{resolved_bucket_name}')"
                        },
                        {
                            "name": "decrypt_key",
                            "value": f"str('{resolved_decrypt_key}')"
                        },
                        {
                            "name": "enable_decrypt",
                            "value": "bool(1)"
                        },
                        {
                            "name": "site_log_path",
                            "value": f"str('{resolved_site_log_path}')"
                        },
                        {
                            "name": "target_path",
                            "value": f"str('{resolved_target_path}')"
                        },
                        {
                            "name": "search_string",
                            "value": f"str('Logged in with userName')"
                        }
                    ],
                    "rawSteps": [
                        {
                            "job_type": "decrypt_logs",
                            "_id": "decrypt_logs"
                        }
                    ]
                }
            },
            "query": "mutation runWorkflow($data: WorkflowInput!) {\n  runWorkflow(data: $data) {\n    stepResults {\n      stepId\n      stepInfo\n      result\n      metricSummary\n    }\n    status\n    message\n    errorLog {\n      error\n      function\n      traceback\n    }\n  }\n}"
        }

        # Use authenticated request with auto-refresh
        url = "https://cloud-uat-api.ecsiteapp.com/api/graphql"
        response = make_authenticated_request("POST", url, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        data = response.json()
        
        # Return the GraphQL response data
        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Generate S3 Log Files for Site 2d API Call -----------------
@app.post("/s3/log/{site_id}/generate1")
async def generate_s3_log_files1(site_id: str, body: Optional[S3SiteRequest] = None):
    """
    Get log files for a specific site using GraphQL API.
    The payload is modified based on the selected site_id.
    """
    try:
        # Resolve inputs (prefer body values, fall back to path param where appropriate)
        resolved_site_id = (body.siteId if body and body.siteId else site_id)
        resolved_company_id = (body.companyId if body and body.companyId else None)
        resolved_company_code = (body.companyCode if body and body.companyCode else None)
        resolved_site_code = (body.siteCode if body and body.siteCode else None)
        resolved_bucket_name = (body.bucket_name if body and body.bucket_name else "ecsite-cloud-uat")
        resolved_decrypt_key = ("ecsite")
        resolved_site_log_path = (body.site_log_path if body and body.site_log_path else None)
        timestamp_ms = (body.timestamp_ms if body and body.timestamp_ms else None)
        # Use siteCode for S3 path to match download URL format
        resolved_target_path = f"{resolved_company_code}/{resolved_site_code}/ecsOpsTool/decrypted_{timestamp_ms}/"

        # Validate required fields
        if not resolved_company_id or not resolved_company_code or not resolved_site_code:
            raise HTTPException(status_code=400, detail="companyId, companyCode, and siteCode are required in request body")

        # GraphQL payload for fetching log files for a specific site
        payload = {
            "operationName": "runWorkflow",
            "variables": {
                "data": {
                    "isAsync": False,
                    "siteId": resolved_site_id,
                    "companyId": resolved_company_id,
                    "userArgs": [
                        {
                            "name": "bucket_name",
                            "value": f"str('{resolved_bucket_name}')"
                        },
                        {
                            "name": "companyCode",
                            "value": f"str('{resolved_company_code}')"
                        },
                        {
                            "name": "siteCode",
                            "value": f"str('{resolved_site_code}')"
                        },
                        {
                            "name": "target_path",
                            "value": f"str('{resolved_target_path}')"
                        }
                    ],
                    "rawSteps": [
                        {
                            "job_type": "support_decrypt",
                            "_id": "support_decrypt",
                            "returnResult": True,
                            "input": {
                                "companyCode": "{args.companyCode}",
                                "siteCode": "{args.siteCode}",
                                "bucket_name": "{args.bucket_name}",
                                "target_path": "{args.target_path}"
                            }
                        }
                    ]
                }
            },
            "query": "mutation runWorkflow($data: WorkflowInput!) {\n  runWorkflow(data: $data) {\n    stepResults {\n      stepId\n      stepInfo\n      result\n      metricSummary\n    }\n    status\n    message\n    errorLog {\n      error\n      function\n      traceback\n    }\n  }\n}"
        }

        # Use authenticated request with auto-refresh
        url = "https://cloud-uat-api.ecsiteapp.com/api/graphql"
        response = make_authenticated_request("POST", url, json=payload)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        data = response.json()
        
        # Return the GraphQL response data
        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- List Files in S3 ZIP -----------------
@app.post("/s3/list-zip-files")
async def list_zip_files(body: S3SiteRequest):
    """
    Download the decryptedLogs.zip from S3 and list all log files inside it.
    Returns list of file paths that can be selected for processing.
    """
    try:
        if not body or not body.companyCode or not body.siteCode or not body.timestamp_ms:
            raise HTTPException(status_code=400, detail="companyCode, siteCode, and timestamp_ms are required")

        zip_url = (
            f"https://cloud-uat-api.ecsiteapp.com/api/s3/ecsite-cloud-uat/"
            f"{body.companyCode}/{body.siteCode}/ecsOpsTool/decrypted_{body.timestamp_ms}/decryptedLogs.zip"
        )

        # Fetch the zip (server-side avoids browser CORS)
        resp = requests.get(zip_url, stream=True, allow_redirects=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch zip: {resp.text[:300]}")

        zip_bytes = io.BytesIO(resp.content)
        try:
            with zipfile.ZipFile(zip_bytes) as zf:
                # List all files, filtering for log/text files
                all_files = zf.namelist()
                log_files = [
                    f for f in all_files 
                    if not f.endswith('/') and (f.lower().endswith('.log') or f.lower().endswith('.txt') or f.lower().endswith('.log.txt'))
                ]
                return {
                    "files": log_files,
                    "total_files": len(log_files),
                    "all_files": all_files  # Include all for debugging
                }
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Downloaded file is not a valid zip")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- Process Selected Files from ZIP -----------------
@app.post("/s3/process-selected-files")
async def process_selected_files(body: ZipFileSelectionRequest):
    """
    Download the ZIP, extract selected files, and process them (decrypted logs).
    Reuses the same parsing logic as read_log but without decryption step.
    """
    try:
        if not body.selectedFiles:
            raise HTTPException(status_code=400, detail="selectedFiles cannot be empty")

        zip_url = (
            f"https://cloud-uat-api.ecsiteapp.com/api/s3/ecsite-cloud-uat/"
            f"{body.companyCode}/{body.siteCode}/ecsOpsTool/decrypted_{body.timestamp_ms}/decryptedLogs.zip"
        )

        # Fetch the zip
        resp = requests.get(zip_url, stream=True, allow_redirects=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch zip: {resp.text[:300]}")

        zip_bytes = io.BytesIO(resp.content)
        try:
            with zipfile.ZipFile(zip_bytes) as zf:
                global logs_storage, sessions_storage
                filename_context = f"{body.companyCode}_{body.siteCode}_decrypted.zip"

                # Initialize counters
                max_existing_log_id = max([log.get("id", 0) for log in logs_storage], default=0)
                max_existing_session_id = max([session.get("session_id", 0) for session in sessions_storage], default=0)

                device_counters: Dict[str, int] = {}
                current_device_id = None
                current_session_id = max_existing_session_id
                current_session_screens: List[str] = []
                current_session_start_time = None
                last_log_time = None
                global_counter = max_existing_log_id + 1
                current_session_filename = None  # Track filename for current session

                # Process only selected files
                for member in body.selectedFiles:
                    if member not in zf.namelist():
                        continue  # Skip if file doesn't exist in ZIP

                    try:
                        content_bytes = zf.read(member)
                        lines = content_bytes.decode("utf-8", errors="ignore").splitlines()
                    except Exception as e:
                        print(f"Error reading {member}: {e}")
                        continue

                    for line in lines:
                        if not line.strip():
                            continue

                        decrypted = line.strip()

                        # Detect DEVICE ID
                        match = re.search(r"DEVICE ID\s+([A-Z0-9\-]+)", decrypted)
                        if match:
                            current_device_id = match.group(1)
                            if current_device_id not in device_counters:
                                device_counters[current_device_id] = 1
                            continue

                        is_entry_log = "LOG-APP" in decrypted and "App Version" in decrypted
                        is_background = "ECS-ACTIVITY" in decrypted and "App state background" in decrypted
                        is_active = "ECS-ACTIVITY" in decrypted and "App state active" in decrypted
                        is_navigate = "ECS-ACTIVITY" in decrypted and "NAVIGATE-TO" in decrypted

                        if is_entry_log:
                            current_session_id += 1
                            current_session_screens = []
                            current_session_start_time = None
                            current_session_filename = member or filename_context  # Track filename for new session

                        if current_device_id:
                            time_match = re.match(r"^(\d{2}:\d{2}:\d{2}:\d{2,3})", decrypted)
                            extracted_time = time_match.group(1) if time_match else None

                            if time_match:
                                cleaned_message = decrypted[time_match.end():].lstrip(" |")
                            else:
                                cleaned_message = decrypted

                            log_entry = {
                                "id": global_counter,
                                "device_log_id": device_counters[current_device_id],
                                "device_id": current_device_id,
                                "time": extracted_time,
                                "message": cleaned_message,
                                "session_id": current_session_id if current_session_id > 0 else 1,
                                "raw": decrypted,
                                "filename": member or filename_context,
                            }
                            logs_storage.append(log_entry)

                            if extracted_time:
                                last_log_time = extracted_time
                                if current_session_start_time is None:
                                    current_session_start_time = extracted_time
                            if is_navigate:
                                screen_match = re.search(r"NAVIGATE-TO\s*:\s*\{\s*screen\s*:\s*([^}\s]+)", decrypted)
                                if screen_match:
                                    current_session_screens.append(screen_match.group(1))

                            if is_entry_log and current_session_id > 1:
                                prev_session_id = current_session_id - 1
                                prev_logs = [l for l in logs_storage if l["session_id"] == prev_session_id and l["device_id"] == current_device_id]
                                if prev_logs:
                                    # Get filename from the logs of previous session
                                    prev_session_filename = prev_logs[0].get("filename", member or filename_context)
                                    sessions_storage.append({
                                        "device_id": current_device_id,
                                        "session_id": prev_session_id,
                                        "start_time": prev_logs[0].get("time"),
                                        "end_time": prev_logs[-1].get("time"),
                                        "entries_count": len(prev_logs),
                                        "screens": [s for s in current_session_screens[:-1]] if len(current_session_screens) > 0 else [],
                                        "filename": prev_session_filename,
                                    })

                            device_counters[current_device_id] += 1
                            global_counter += 1

                # Finalize last session summary
                if current_session_id >= 1 and current_device_id:
                    last_session_logs = [l for l in logs_storage if l["session_id"] == current_session_id and l["device_id"] == current_device_id]
                    if last_session_logs:
                        # Get filename from the logs of the last session
                        last_session_filename = last_session_logs[0].get("filename", current_session_filename or filename_context)
                        sessions_storage.append({
                            "device_id": current_device_id,
                            "session_id": current_session_id,
                            "start_time": last_session_logs[0].get("time"),
                            "end_time": last_session_logs[-1].get("time"),
                            "entries_count": len(last_session_logs),
                            "screens": current_session_screens,
                            "filename": last_session_filename,
                        })

            return {
                "message": "Selected files processed successfully",
                "total_logs": len(logs_storage),
                "total_sessions": len(sessions_storage),
                "processed_files": body.selectedFiles
            }
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Downloaded file is not a valid zip")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- Get All Logs -----------------  
@app.get("/logs")
async def get_logs(device_id: str = None):
    """
    Get all logs (optionally filter by device_id).
    """
    if device_id:
        filtered_logs = [log for log in logs_storage if log["device_id"] == device_id]
        return {"logs": filtered_logs}
    return {"logs": logs_storage}
    

# ----------------- Get Paginated Logs -----------------
@app.get("/logs/paginated")
async def get_paginated_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(250, ge=1, le=1000),
    device_id: str = None,
    session_id: int = None,
):
    """
    Get logs with pagination (optionally filter by device_id or session_id).
    """
    filtered_logs = logs_storage
    
    if device_id:
        filtered_logs = [log for log in filtered_logs if log["device_id"] == device_id]
    
    if session_id is not None:
        filtered_logs = [log for log in filtered_logs if log["session_id"] == session_id]

    total = len(filtered_logs)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_logs = filtered_logs[start:end]

    return {
        "metadata": {
            "total_logs": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        },
        "logs": paginated_logs,
    }


# ----------------- Sessions Endpoints -----------------
@app.get("/sessions")
async def get_sessions(device_id: str = None):
    """
    Return list of session summaries, optionally filtered by device_id.
    """
    if device_id:
        return {"sessions": [s for s in sessions_storage if s["device_id"] == device_id]}
    return {"sessions": sessions_storage}


@app.get("/sessions/paginated")
async def get_sessions_paginated(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    device_id: str = None,
):
    if device_id:
        filtered = [s for s in sessions_storage if s["device_id"] == device_id]
    else:
        filtered = sessions_storage

    total = len(filtered)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = filtered[start:end]

    return {
        "metadata": {
            "total_sessions": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        },
        "sessions": page_items,
    }


# ----------------- Get List of Log Files -----------------
@app.get("/logs/files")
async def get_log_files():
    """
    Get list of unique filenames from logs_storage.
    Returns list of all files that have been uploaded and processed.
    """
    unique_files = set()
    for log in logs_storage:
        filename = log.get("filename")
        if filename:
            unique_files.add(filename)
    
    # Return as sorted list
    return {
        "files": sorted(list(unique_files)),
        "total_files": len(unique_files)
    }


# ----------------- Get Raw Log File by Filename -----------------
@app.get("/logs/raw/file")
async def get_raw_log_file_by_filename(filename: str = Query(..., description="Name of the log file")):
    """
    Get full raw log file content for a specific filename.
    Returns all logs for that file in raw format (timestamp | level: message).
    """
    filtered_logs = [log for log in logs_storage if log.get("filename") == filename]
    
    if not filtered_logs:
        raise HTTPException(status_code=404, detail=f"No logs found for file: {filename}")
    
    # Format logs in raw file format: timestamp | level: message
    raw_content = []
    for log in filtered_logs:
        timestamp = log.get("time", "") or ""
        message = log.get("message", "")
        
        # Extract log level from message
        message_upper = message.upper()
        if "ERROR" in message_upper or "EXCEPTION" in message_upper:
            level = "ERROR"
        elif "WARNING" in message_upper or "WARN" in message_upper:
            level = "WARNING"
        elif "INFO" in message_upper:
            level = "INFO"
        elif "DEBUG" in message_upper:
            level = "DEBUG"
        else:
            level = "INFO"
        
        # Format: timestamp | level: message
        if timestamp:
            raw_content.append(f"{timestamp} | {level}: {message}")
        else:
            raw_content.append(f"{level}: {message}")
    
    return {
        "content": "\n".join(raw_content),
        "total_logs": len(filtered_logs),
        "filename": filename
    }


# ----------------- Get List of Log Files -----------------
@app.get("/logs/files")
async def get_log_files():
    """
    Get list of unique filenames from logs_storage.
    Returns list of all files that have been uploaded and processed.
    """
    unique_files = set()
    for log in logs_storage:
        filename = log.get("filename")
        if filename:
            unique_files.add(filename)
    
    # Return as sorted list
    return {
        "files": sorted(list(unique_files)),
        "total_files": len(unique_files)
    }


# ----------------- Get Raw Log File by Filename -----------------
@app.get("/logs/raw/file")
async def get_raw_log_file_by_filename(filename: str = Query(..., description="Name of the log file")):
    """
    Get full raw log file content for a specific filename.
    Returns all logs for that file in raw format (timestamp | level: message).
    """
    filtered_logs = [log for log in logs_storage if log.get("filename") == filename]
    
    if not filtered_logs:
        raise HTTPException(status_code=404, detail=f"No logs found for file: {filename}")
    
    # Format logs in raw file format: timestamp | level: message
    raw_content = []
    for log in filtered_logs:
        timestamp = log.get("time", "") or ""
        message = log.get("message", "")
        
        # Extract log level from message
        message_upper = message.upper()
        if "ERROR" in message_upper or "EXCEPTION" in message_upper:
            level = "ERROR"
        elif "WARNING" in message_upper or "WARN" in message_upper:
            level = "WARNING"
        elif "INFO" in message_upper:
            level = "INFO"
        elif "DEBUG" in message_upper:
            level = "DEBUG"
        else:
            level = "INFO"
        
        # Format: timestamp | level: message
        if timestamp:
            raw_content.append(f"{timestamp} | {level}: {message}")
        else:
            raw_content.append(f"{level}: {message}")
    
    return {
        "content": "\n".join(raw_content),
        "total_logs": len(filtered_logs),
        "filename": filename
    }


# ----------------- Get Raw Log File -----------------
@app.get("/logs/raw")
async def get_raw_log_file(session_id: int = None):
    """
    Get full raw log file content without any filters.
    Returns all logs in raw format (timestamp | level: message).
    Optionally filter by session_id.
    """
    filtered_logs = logs_storage
    
    if session_id is not None:
        filtered_logs = [log for log in logs_storage if log.get("session_id") == session_id]
    
    # Format logs in raw file format: timestamp | level: message
    raw_content = []
    for log in filtered_logs:
        timestamp = log.get("time", "") or ""
        message = log.get("message", "")
        
        # Extract log level from message
        message_upper = message.upper()
        if "ERROR" in message_upper or "EXCEPTION" in message_upper:
            level = "ERROR"
        elif "WARNING" in message_upper or "WARN" in message_upper:
            level = "WARNING"
        elif "INFO" in message_upper:
            level = "INFO"
        elif "DEBUG" in message_upper:
            level = "DEBUG"
        else:
            level = "INFO"
        
        # Format: timestamp | level: message
        if timestamp:
            raw_content.append(f"{timestamp} | {level}: {message}")
        else:
            raw_content.append(f"{level}: {message}")
    
    return {
        "content": "\n".join(raw_content),
        "total_logs": len(filtered_logs)
    }


# ----------------- Get Single Log -----------------
@app.get("/logs/{log_id}")
async def get_log(log_id: int):
    """
    Get details of a single log entry by its unique ID.
    """
    log = next((log for log in logs_storage if log["id"] == log_id), None)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


# ----------------- Get Device Statistics -----------------
@app.get("/stats/devices")
async def get_device_stats():
    """
    Get statistics about devices and their log counts.
    """
    device_stats = {}
    for log in logs_storage:
        device_id = log["device_id"]
        if device_id not in device_stats:
            device_stats[device_id] = {
                "device_id": device_id,
                "total_logs": 0,
                "error_count": 0,
                "warning_count": 0,
                "info_count": 0,
            }
        
        device_stats[device_id]["total_logs"] += 1
        
        # Count log levels
        message = log["message"].upper()
        if "ERROR" in message or "EXCEPTION" in message:
            device_stats[device_id]["error_count"] += 1
        elif "WARNING" in message or "WARN" in message:
            device_stats[device_id]["warning_count"] += 1
        else:
            device_stats[device_id]["info_count"] += 1
    
    return {"devices": list(device_stats.values())}


# ----------------- Flowchart Data Processing -----------------
def normalize_logs_by_session_device(logs):
    """
    Normalize logs so each session (bounded by App Version entries) carries a consistent device_id.
    We detect session starts at LOG-APP App Version and capture the first DEVICE ID encountered.
    Then we assign that device_id to all logs until the next session start.
    """
    if not logs:
        return []
    
    current_session_device_id = None
    in_session = False
    normalized_logs = []
    # Keep indices for the current session to backfill once DEVICE ID appears
    current_session_indices: list[int] = []
    
    for log in logs:
        message = log.get("message", "")
        
        # Session starts at App Version entry
        if re.search(r"LOG-APP.*App Version", message):
            in_session = True
            current_session_device_id = None
            current_session_indices = []
        
        # Capture device id within a session
        if in_session and re.search(r"LOG-DEVICE-INFO\s*:\s*DEVICE ID\s+", message, re.IGNORECASE):
            device_match = re.search(r"DEVICE ID\s+([A-Z0-9-]+)", message, re.IGNORECASE)
            if device_match and device_match.group(1):
                current_session_device_id = device_match.group(1)
                # Backfill device_id to all logs already seen in this session
                for idx in current_session_indices:
                    normalized_logs[idx]["device_id"] = current_session_device_id
        
        # Assign device id for this log
        normalized_log = log.copy()
        if in_session and current_session_device_id:
            normalized_log["device_id"] = current_session_device_id
        
        normalized_logs.append(normalized_log)
        if in_session:
            current_session_indices.append(len(normalized_logs) - 1)
    
    return normalized_logs


def generate_flowchart_data(logs):
    """
    Generate scalable flowchart data from logs with advanced navigation analysis.
    Handles complex patterns: loops, multiple sessions, bidirectional flows.
    """
    if not logs:
        return {"nodes": [], "edges": []}

    normalized_logs = normalize_logs_by_session_device(logs)

    # Extract all unique screens and their metadata
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"
    screen_data = {}  # screen_name -> {count, sessions, first_seen, last_seen}
    transition_matrix = {}  # (from_screen, to_screen) -> {count, sessions, avg_events}
    login_pattern = r"LOG-APP.*Model Name"
    
    # Analyze each log entry
    for log in normalized_logs:
        message = log.get("message", "")
        session_id = log.get("session_id", 0)
        timestamp = log.get("time", "")
        
        screen_match = re.search(screen_pattern, message)
        if screen_match:
            screen_name = screen_match.group(1).strip()
            
            # Track screen metadata
            if screen_name not in screen_data:
                screen_data[screen_name] = {
                    "count": 0,
                    "sessions": set(),
                    "first_seen": timestamp,
                    "last_seen": timestamp
                }
            
            screen_data[screen_name]["count"] += 1
            screen_data[screen_name]["sessions"].add(session_id)
            screen_data[screen_name]["last_seen"] = timestamp

    # Build transition matrix by analyzing session sequences
    sessions = {}
    for log in normalized_logs:
        session_id = log.get("session_id", 0)
        if session_id not in sessions:
            sessions[session_id] = []
        sessions[session_id].append(log)

    # Analyze transitions within each session
    login_sessions = set()  # Track sessions with login
    for session_id, session_logs in sessions.items():
        screen_sequence = []
        screen_timestamps = {}
        # Track login->home (siteList) per session
        has_login = False
        first_site_idx = None
        
        # Extract screen sequence with timestamps and detect login/home boundaries
        for log in session_logs:
            message = log.get("message", "")
            timestamp = log.get("time", "")
            screen_match = re.search(screen_pattern, message)
            if screen_match:
                screen_name = screen_match.group(1).strip()
                screen_sequence.append(screen_name)
                screen_timestamps[screen_name] = timestamp
                if first_site_idx is None and screen_name == "siteList":
                    first_site_idx = len(session_logs)  # placeholder not used
            if not has_login and re.search(login_pattern, message):
                has_login = True  # flag that a login exists in this session
                login_sessions.add(session_id)

        # Analyze transitions between consecutive screens
        for i in range(len(screen_sequence) - 1):
            from_screen = screen_sequence[i]
            to_screen = screen_sequence[i + 1]
            transition_key = (from_screen, to_screen)
            
            if transition_key not in transition_matrix:
                transition_matrix[transition_key] = {
                    "count": 0,
                    "sessions": set(),
                    "total_events": 0,
                    "event_counts": []
                }
            
            # Count events between these screens in this session
            events_between = count_events_between_screens(session_logs, from_screen, to_screen)
            
            transition_matrix[transition_key]["count"] += 1
            transition_matrix[transition_key]["sessions"].add(session_id)
            transition_matrix[transition_key]["total_events"] += events_between
            transition_matrix[transition_key]["event_counts"].append(events_between)

        # Add synthetic Login -> first screen transition (dynamic, not hardcoded)
        if has_login:
            fs = find_first_screen_after_login(session_logs)
            if fs is not None:
                events_between_login = count_events_login_to_first_screen(session_logs)
                transition_key = ("login", fs)
                if transition_key not in transition_matrix:
                    transition_matrix[transition_key] = {
                        "count": 0,
                        "sessions": set(),
                        "total_events": 0,
                        "event_counts": []
                    }
                transition_matrix[transition_key]["count"] += 1
                transition_matrix[transition_key]["sessions"].add(session_id)
                transition_matrix[transition_key]["total_events"] += max(0, events_between_login or 0)
                transition_matrix[transition_key]["event_counts"].append(max(0, events_between_login or 0))

    # Calculate transition statistics
    for transition_key, data in transition_matrix.items():
        data["avg_events"] = data["total_events"] / data["count"] if data["count"] > 0 else 0
        data["session_count"] = len(data["sessions"])
        data["frequency"] = data["count"] / len(sessions) if sessions else 0

    # Create nodes with enhanced metadata
    nodes = []
    screen_colors = [
        "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-yellow-500", 
        "bg-red-500", "bg-indigo-500", "bg-pink-500", "bg-teal-500",
        "bg-orange-500", "bg-cyan-500", "bg-lime-500", "bg-amber-500",
        "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-sky-500"
    ]
    
    # login_sessions already tracked above

    for i, (screen_name, data) in enumerate(sorted(screen_data.items())):
        readable_label = re.sub(r'([A-Z])', r' \1', screen_name).strip()
        nodes.append({
            "id": screen_name,
            "label": readable_label,
            "color": screen_colors[i % len(screen_colors)],
            "count": data["count"],
            "session_count": len(data["sessions"]),
            "frequency": len(data["sessions"]) / len(sessions) if sessions else 0,
            "first_seen": data["first_seen"],
            "last_seen": data["last_seen"]
        })

    if login_sessions:
        nodes.append({
            "id": "login",
            "label": "Login",
            "color": "bg-sky-500",
            "count": len(login_sessions),
            "session_count": len(login_sessions),
            "frequency": len(login_sessions) / len(sessions) if sessions else 0,
            "first_seen": None,
            "last_seen": None,
        })

    # Create edges with enhanced metadata
    edges = []
    for (from_screen, to_screen), data in transition_matrix.items():
        edges.append({
            "from": from_screen,
            "to": to_screen,
            "count": data["count"],
            "avg_events": round(data["avg_events"], 1),
            "session_count": data["session_count"],
            "frequency": round(data["frequency"], 2),
            "strength": calculate_transition_strength(data)
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "total_sessions": len(sessions),
            "total_screens": len(screen_data),
            "total_transitions": len(transition_matrix),
            "has_loops": detect_loops(transition_matrix)
        }
    }


def count_events_between_screens(session_logs, from_screen, to_screen):
    """Count events between two specific screens in a session."""
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"
    # Special case: login -> any specific screen
    if from_screen == "login":
        value = count_events_login_to_specific_screen(session_logs, to_screen)
        return 0 if value is None else max(0, value)
    start_idx = None
    event_count = 0
    
    for i, log in enumerate(session_logs):
        message = log.get("message", "")
        screen_match = re.search(screen_pattern, message)
        if screen_match:
            current_screen = screen_match.group(1).strip()
            if start_idx is None and current_screen == from_screen:
                start_idx = i
            elif start_idx is not None and current_screen == to_screen:
                event_count = i - start_idx - 1
                break
    
    return max(0, event_count)


def find_first_screen_after_login(session_logs):
    """Return the first NAVIGATE-TO screen name after login within a session, if any."""
    login_pattern = r"LOG-APP.*Model Name"
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"
    saw_login = False
    for log in session_logs:
        msg = log.get("message", "")
        if not saw_login and re.search(login_pattern, msg):
            saw_login = True
            continue
        if saw_login:
            m = re.search(screen_pattern, msg)
            if m:
                return m.group(1).strip()
    return None


def count_events_login_to_first_screen(session_logs):
    """Count events from login to the first NAVIGATE-TO of any screen within the session."""
    login_pattern = r"LOG-APP.*Model Name"
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"
    saw_login = False
    start_index = None
    for i, log in enumerate(session_logs):
        msg = log.get("message", "")
        if not saw_login and re.search(login_pattern, msg):
            saw_login = True
            start_index = i
            continue
        if saw_login:
            m = re.search(screen_pattern, msg)
            if m:
                return i - start_index - 1
    if saw_login and start_index is not None:
        return len(session_logs) - start_index - 1
    return None


def count_events_login_to_specific_screen(session_logs, target_screen: str):
    """Count events from login to the first occurrence of the given target NAVIGATE-TO screen."""
    if not target_screen:
        return count_events_login_to_first_screen(session_logs)
    login_pattern = r"LOG-APP.*Model Name"
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"
    saw_login = False
    start_index = None
    for i, log in enumerate(session_logs):
        msg = log.get("message", "")
        if not saw_login and re.search(login_pattern, msg):
            saw_login = True
            start_index = i
            continue
        if saw_login:
            m = re.search(screen_pattern, msg)
            if m and m.group(1).strip() == target_screen:
                return i - start_index - 1
    if saw_login and start_index is not None:
        return len(session_logs) - start_index - 1
    return None


def calculate_transition_strength(data):
    """Calculate transition strength based on frequency and consistency."""
    frequency_score = data["frequency"] * 10  # 0-10 scale
    consistency_score = 1 - (max(data["event_counts"]) - min(data["event_counts"])) / max(data["event_counts"]) if data["event_counts"] else 1
    return min(10, round(frequency_score + consistency_score, 1))


def detect_loops(transition_matrix):
    """Detect if there are loops in the transition graph."""
    # Simple loop detection: if A->B and B->A exist
    for (from_screen, to_screen) in transition_matrix.keys():
        if (to_screen, from_screen) in transition_matrix:
            return True
    return False


def get_events_for_edge(logs, from_state, to_state):
    """
    Get events between two screens for the events panel.
    Uses dynamic screen detection from NAVIGATE-TO entries.
    """
    normalized_logs = normalize_logs_by_session_device(logs)
    events = []

    # Dynamic screen pattern
    screen_pattern = r"NAVIGATE-TO.*screen\s*:\s*([^}\s,]+)"

    def find_between_screens(logs_seq, from_screen: str, to_screen: str):
        """Find events between first occurrence of from_screen and next occurrence of to_screen within same session."""
        start_idx = None
        current_session = None
        for i, log in enumerate(logs_seq):
            msg = log.get("message", "")
            sid = log.get("session_id")
            # Reset when session changes
            if current_session is None:
                current_session = sid
            elif sid != current_session:
                start_idx = None
                current_session = sid
            
            screen_match = re.search(screen_pattern, msg)
            if screen_match:
                current_screen = screen_match.group(1).strip()
                if start_idx is None and current_screen == from_screen:
                    start_idx = i
                elif start_idx is not None and current_screen == to_screen:
                    return logs_seq[start_idx + 1:i]
        return []

    # Handle Login -> any specific screen dynamically
    if from_state == "login":
        sessions_map = {}
        for log in normalized_logs:
            sessions_map.setdefault(log.get("session_id"), []).append(log)
        for _sid, s_logs in sessions_map.items():
            login_idx = None
            end_idx = None
            for i, log in enumerate(s_logs):
                if login_idx is None and re.search(r"LOG-APP.*Model Name", log.get("message", "")):
                    login_idx = i
                    continue
                if login_idx is not None:
                    m = re.search(screen_pattern, log.get("message", ""))
                    if m and (to_state is None or m.group(1).strip() == to_state):
                        end_idx = i
                        break
            if login_idx is not None:
                if end_idx is not None and end_idx > login_idx:
                    return s_logs[login_idx + 1:end_idx]
                else:
                    return s_logs[login_idx + 1:]
        return []

    # Use dynamic screen detection
    events = find_between_screens(normalized_logs, from_state, to_state)
    return events


@app.get("/flowchart")
async def get_flowchart_data(device_id: str = None, session_id: int = None):
    """
    Get flowchart data with nodes and edges, optionally filtered by device_id or session_id.
    """
    # First normalize all logs to ensure device_id is populated
    normalized_logs = normalize_logs_by_session_device(logs_storage)
    
    # Then filter by device_id or session_id
    if device_id:
        filtered_logs = [log for log in normalized_logs if log.get("device_id") == device_id]
    elif session_id:
        filtered_logs = [log for log in normalized_logs if log.get("session_id") == session_id]
    else:
        filtered_logs = normalized_logs
    
    flowchart_data = generate_flowchart_data(filtered_logs)
    return flowchart_data


@app.get("/flowchart/events")
async def get_flowchart_events(
    from_state: str = Query(..., description="Source state (login, home, site, node)"),
    to_state: str = Query(..., description="Target state (home, site, node, logout)"),
    device_id: str = None,
    session_id: int = None
):
    """
    Get events between two states for the events panel.
    """
    # First normalize all logs to ensure device_id is populated
    normalized_logs = normalize_logs_by_session_device(logs_storage)
    
    # Then filter by device_id or session_id
    if device_id:
        filtered_logs = [log for log in normalized_logs if log.get("device_id") == device_id]
    elif session_id:
        filtered_logs = [log for log in normalized_logs if log.get("session_id") == session_id]
    else:
        filtered_logs = normalized_logs
    
    events = get_events_for_edge(filtered_logs, from_state, to_state)
    return {"events": events}


# ----------------- Health Check -----------------
@app.get("/debug/login")
async def debug_login(session_id: int = None):
    """
    Debug endpoint to check login detection.
    """
    normalized_logs = normalize_logs_by_session_device(logs_storage)
    
    if session_id:
        filtered_logs = [log for log in normalized_logs if log.get("session_id") == session_id]
    else:
        filtered_logs = normalized_logs
    
    login_pattern = r"LOG-APP.*Model Name"
    login_found = []
    
    for log in filtered_logs:
        message = log.get("message", "")
        if re.search(login_pattern, message):
            login_found.append({
                "session_id": log.get("session_id"),
                "message": message,
                "time": log.get("time")
            })
    
    return {
        "login_pattern": login_pattern,
        "login_found": login_found,
        "total_logs_checked": len(filtered_logs)
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    """
    return {"status": "healthy", "total_logs": len(logs_storage)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
