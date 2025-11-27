# Log Dashboard - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Installation & Setup](#installation--setup)
7. [API Documentation](#api-documentation)
8. [Frontend Components](#frontend-components)
9. [Data Flow](#data-flow)
10. [Key Functionalities](#key-functionalities)
11. [Configuration](#configuration)
12. [Usage Guide](#usage-guide)
13. [Development Guide](#development-guide)
14. [Troubleshooting](#troubleshooting)

---

## Overview

The **Log Dashboard** is a comprehensive web application designed for analyzing encrypted log files from mobile applications. It provides a modern, user-friendly interface for uploading, decrypting, processing, and visualizing log data with advanced analytics capabilities.

### Purpose

- **Log File Processing**: Upload and decrypt AES-encrypted log files (CryptoJS compatible)
- **Device-based Organization**: Automatically detect and organize logs by device ID
- **Session Analysis**: Track user sessions and navigation patterns
- **Test Results Analysis**: Parse and analyze test execution results
- **Visualization**: Interactive flowcharts showing user navigation patterns
- **S3 Integration**: Support for processing log files from AWS S3 buckets
- **Real-time Insights**: Instant analysis and statistics generation

---

## Architecture

### System Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   React Frontend │ ◄─────► │  FastAPI Backend │ ◄─────► │  External APIs  │
│   (Port 5173)    │  HTTP   │   (Port 8000)    │  HTTP   │  (S3, GraphQL)  │
└─────────────────┘         └─────────────────┘         └─────────────────┘
       │                              │
       │                              │
       ▼                              ▼
┌─────────────────┐         ┌─────────────────┐
│  Browser Storage │         │  In-Memory Store │
│  (SessionStorage)│         │  (logs_storage) │
└─────────────────┘         └─────────────────┘
```

### Component Architecture

**Frontend:**
- **React Router**: URL-based navigation with state management
- **Component-based**: Modular, reusable UI components
- **State Management**: React hooks with session storage persistence

**Backend:**
- **RESTful API**: FastAPI with automatic OpenAPI documentation
- **In-Memory Storage**: Lists for logs and sessions (can be extended to database)
- **Authentication**: Token-based authentication for external APIs
- **CORS Enabled**: Cross-origin resource sharing for frontend integration

---

## Features

### Core Features

1. **Encrypted Log Processing**
   - AES decryption compatible with CryptoJS
   - Automatic line-by-line decryption
   - Error handling for invalid encrypted data

2. **Device Detection & Organization**
   - Automatic device ID extraction from logs
   - Device-based log grouping
   - Per-device statistics and analytics

3. **Session Management**
   - Automatic session detection (based on "LOG-APP: App Version" entries)
   - Session boundary tracking
   - Screen navigation tracking within sessions
   - Session metadata (start time, end time, entry count)

4. **Test Results Analysis**
   - Parse TESTING-INFO events from logs
   - Track test status: Started, Completed, Aborted, Stopped, Deleted
   - Per-file test statistics
   - Test sequence tracking

5. **Navigation Flowchart**
   - Interactive visualization of user navigation patterns
   - Screen transition analysis
   - Event counting between screens
   - Login detection and flow tracking
   - Loop detection in navigation paths

6. **S3 Integration**
   - Fetch sites from GraphQL API
   - Download and process log files from S3
   - ZIP file extraction and selective file processing
   - Decrypted log file generation

7. **File Management**
   - Multiple file upload support
   - File selection from S3 ZIP archives
   - File status tracking (uploading, processing, completed, error)
   - File deletion and data clearing

8. **Search & Filter**
   - Full-text search in log files
   - Device-based filtering
   - Session-based filtering
   - Pagination for large datasets

9. **Real-time Analytics**
   - Device statistics (total logs, errors, warnings, info)
   - Session summaries
   - Test result summaries
   - Navigation pattern analysis

### UI Features

- **Modern Design**: Clean, responsive interface with Tailwind CSS
- **Drag & Drop Upload**: Intuitive file upload interface
- **Progress Tracking**: Real-time upload and processing progress
- **Breadcrumb Navigation**: Clear navigation hierarchy
- **Error Handling**: User-friendly error messages
- **Loading States**: Visual feedback during operations
- **Responsive Layout**: Mobile-friendly design

---

## Technology Stack

### Backend

- **Python 3.12+**: Core programming language
- **FastAPI 0.117.1**: Modern, fast web framework
- **Uvicorn 0.36.0**: ASGI server
- **PyCryptodome 3.23.0**: Cryptographic operations (AES decryption)
- **Pydantic 2.11.9**: Data validation
- **Requests**: HTTP client for external API calls
- **Python-multipart**: File upload handling

### Frontend

- **React 19.1.1**: UI framework
- **React Router DOM 7.9.3**: Client-side routing
- **Vite 7.1.7**: Build tool and dev server
- **Tailwind CSS 3.4.17**: Utility-first CSS framework
- **Axios 1.12.2**: HTTP client
- **Lucide React 0.544.0**: Icon library
- **Radix UI**: Accessible component primitives
- **React Dropzone 14.2.3**: File upload component
- **@xyflow/react 12.9.3**: Flowchart visualization
- **@dagrejs/dagre 1.1.8**: Graph layout algorithm

### Development Tools

- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **Autoprefixer**: CSS vendor prefixing

---

## Project Structure

```
log-dashboard/
├── backend/
│   ├── app.py                      # Main FastAPI application
│   ├── requirements.txt            # Python dependencies
│   ├── test_backend.py             # Backend API tests
│   ├── generate_test_logs.py       # Test log generator
│   ├── sample_encrypted_logs.log    # Sample test data
│   └── venv/                       # Python virtual environment
│
├── frontend/
│   ├── package.json                # Node.js dependencies
│   ├── vite.config.js              # Vite configuration
│   ├── tailwind.config.js          # Tailwind CSS configuration
│   ├── postcss.config.js           # PostCSS configuration
│   ├── eslint.config.js            # ESLint configuration
│   ├── index.html                  # HTML entry point
│   │
│   └── src/
│       ├── main.jsx                # React entry point
│       ├── App.jsx                 # Main app component with routing
│       ├── App.css                 # Global styles
│       ├── index.css               # Base styles
│       │
│       ├── config/
│       │   └── api.js              # API configuration
│       │
│       ├── pages/
│       │   ├── UploadPage.jsx      # File upload page
│       │   ├── LoadingPage.jsx     # Loading/analysis page
│       │   ├── InsightsPage.jsx    # Log insights page
│       │   ├── TestStatsPage.jsx    # Test statistics page
│       │   ├── FullLogFilePage.jsx # Full log file viewer
│       │   ├── HistoryPage.jsx     # History page
│       │   └── NotFoundPage.jsx    # 404 page
│       │
│       ├── components/
│       │   ├── ui/                 # Reusable UI components
│       │   │   ├── button.jsx
│       │   │   ├── card.jsx
│       │   │   ├── badge.jsx
│       │   │   ├── avatar.jsx
│       │   │   ├── breadcrumb.jsx
│       │   │   └── progress.jsx
│       │   ├── TestStats.jsx       # Test statistics component
│       │   └── ...
│       │
│       ├── assets/                 # Static assets
│       │   ├── icons/              # SVG icons
│       │   └── images/             # Images
│       │
│       ├── lib/
│       │   └── utils.js            # Utility functions
│       │
│       ├── Header.jsx              # Application header
│       ├── FileUpload.jsx          # File upload component
│       ├── LogFilesList.jsx        # Log files list component
│       ├── LogInsights.jsx         # Log insights component
│       ├── LogDashboard.jsx        # Dashboard component
│       └── AnalysisLoading.jsx    # Loading animation
│
├── README.md                       # Main README
├── DOCUMENTATION.md                # This file
├── ROUTING_SUMMARY.md              # Routing documentation
├── NETWORK_ACCESS.md               # Network configuration guide
├── SETUP_COMPLETE.md               # Setup completion guide
├── start.sh                        # Startup script
└── demo.sh                         # Demo script
```

---

## Installation & Setup

### Prerequisites

- **Python 3.12+**: For backend
- **Node.js 18+**: For frontend
- **npm** or **yarn**: Package manager
- **Git**: Version control (optional)

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   ```

3. **Activate virtual environment:**
   ```bash
   # Linux/Mac
   source venv/bin/activate
   
   # Windows
   venv\Scripts\activate
   ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

5. **Start backend server:**
   ```bash
   python app.py
   ```
   
   Backend will be available at `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```
   
   Frontend will be available at `http://localhost:5173`

### Quick Start Script

Use the provided startup script for automated setup:

```bash
./start.sh
```

This script will:
- Check for Python and Node.js
- Set up virtual environment
- Install dependencies
- Start both backend and frontend servers

---

## API Documentation

### Base URL

- **Local Development**: `http://localhost:8000`
- **API Documentation**: `http://localhost:8000/docs` (Swagger UI)
- **Alternative Docs**: `http://localhost:8000/redoc` (ReDoc)

### Authentication

The application uses token-based authentication for external API calls (S3, GraphQL). Tokens are cached and automatically refreshed when expired.

### Core Endpoints

#### Log File Upload

**POST** `/read-log/`

Upload and process encrypted log files.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (encrypted log file)

**Response:**
```json
{
  "message": "File processed successfully",
  "total_logs": 150,
  "total_sessions": 5
}
```

#### Get All Logs

**GET** `/logs`

Retrieve all logs, optionally filtered by device.

**Query Parameters:**
- `device_id` (optional): Filter by device ID

**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "device_log_id": 1,
      "device_id": "DEVICE-001",
      "time": "07:25:03:987",
      "message": "LOG-APP: App Version: 1.0.0",
      "session_id": 1,
      "raw": "encrypted_string",
      "filename": "log_file.log"
    }
  ]
}
```

#### Get Paginated Logs

**GET** `/logs/paginated`

Get logs with pagination support.

**Query Parameters:**
- `page` (default: 1): Page number
- `per_page` (default: 250, max: 1000): Items per page
- `device_id` (optional): Filter by device ID
- `session_id` (optional): Filter by session ID

**Response:**
```json
{
  "metadata": {
    "total_logs": 1500,
    "page": 1,
    "per_page": 250,
    "total_pages": 6
  },
  "logs": [...]
}
```

#### Get Single Log

**GET** `/logs/{log_id}`

Get details of a specific log entry.

**Response:**
```json
{
  "id": 1,
  "device_log_id": 1,
  "device_id": "DEVICE-001",
  "time": "07:25:03:987",
  "message": "LOG-APP: App Version: 1.0.0",
  "session_id": 1,
  "raw": "encrypted_string",
  "filename": "log_file.log"
}
```

#### Get Log Files List

**GET** `/logs/files`

Get list of all uploaded log files.

**Response:**
```json
{
  "files": ["file1.log", "file2.log"],
  "total_files": 2
}
```

#### Get Raw Log File

**GET** `/logs/raw/file`

Get full raw log file content for a specific filename.

**Query Parameters:**
- `filename` (required): Name of the log file

**Response:**
```json
{
  "content": "07:25:03:987 | INFO: LOG-APP: App Version: 1.0.0\n...",
  "total_logs": 150,
  "filename": "log_file.log"
}
```

### Session Endpoints

#### Get Sessions

**GET** `/sessions`

Get all session summaries.

**Query Parameters:**
- `device_id` (optional): Filter by device ID

**Response:**
```json
{
  "sessions": [
    {
      "device_id": "DEVICE-001",
      "session_id": 1,
      "start_time": "07:25:03:987",
      "end_time": "07:30:15:123",
      "entries_count": 45,
      "screens": ["siteList", "siteDetails", "nodeList"],
      "filename": "log_file.log"
    }
  ]
}
```

#### Get Paginated Sessions

**GET** `/sessions/paginated`

Get sessions with pagination.

**Query Parameters:**
- `page` (default: 1): Page number
- `per_page` (default: 10, max: 100): Items per page
- `device_id` (optional): Filter by device ID

### Statistics Endpoints

#### Get Device Statistics

**GET** `/stats/devices`

Get statistics for all devices.

**Response:**
```json
{
  "devices": [
    {
      "device_id": "DEVICE-001",
      "total_logs": 150,
      "error_count": 5,
      "warning_count": 10,
      "info_count": 135
    }
  ]
}
```

### Flowchart Endpoints

#### Get Flowchart Data

**GET** `/flowchart`

Get navigation flowchart data.

**Query Parameters:**
- `device_id` (optional): Filter by device ID
- `session_id` (optional): Filter by session ID

**Response:**
```json
{
  "nodes": [
    {
      "id": "siteList",
      "label": "Site List",
      "color": "bg-blue-500",
      "count": 10,
      "session_count": 5,
      "frequency": 0.83
    }
  ],
  "edges": [
    {
      "from": "login",
      "to": "siteList",
      "count": 5,
      "avg_events": 3.2,
      "session_count": 5,
      "frequency": 0.83,
      "strength": 8.5
    }
  ],
  "metadata": {
    "total_sessions": 6,
    "total_screens": 8,
    "total_transitions": 12,
    "has_loops": true
  }
}
```

#### Get Flowchart Events

**GET** `/flowchart/events`

Get events between two states for the events panel.

**Query Parameters:**
- `from_state` (required): Source state (e.g., "login", "siteList")
- `to_state` (required): Target state
- `device_id` (optional): Filter by device ID
- `session_id` (optional): Filter by session ID

### S3 Integration Endpoints

#### Get Sites

**POST** `/s3/log`

Get list of sites from GraphQL API.

**Request Body:**
```json
{
  "siteId": "optional_site_id",
  "companyId": "optional_company_id",
  "companyCode": "optional_company_code",
  "siteCode": "optional_site_code"
}
```

#### Get S3 Log Files for Site

**POST** `/s3/log/{site_id}`

Get log files for a specific site.

**Request Body:**
```json
{
  "companyId": "required",
  "companyCode": "required",
  "siteCode": "required",
  "bucket_name": "ecsite-cloud-uat"
}
```

#### Generate Decrypted Logs

**POST** `/s3/log/{site_id}/generate`

Generate decrypted log files for a site.

**Request Body:**
```json
{
  "companyId": "required",
  "companyCode": "required",
  "siteCode": "required",
  "site_log_path": "optional_path",
  "timestamp_ms": "required",
  "bucket_name": "ecsite-cloud-uat"
}
```

#### List ZIP Files

**POST** `/s3/list-zip-files`

List files in the decrypted logs ZIP.

**Request Body:**
```json
{
  "companyCode": "required",
  "siteCode": "required",
  "timestamp_ms": "required"
}
```

**Response:**
```json
{
  "files": ["file1.log", "file2.log"],
  "total_files": 2,
  "all_files": [...]
}
```

#### Process Selected Files

**POST** `/s3/process-selected-files`

Process selected files from ZIP archive.

**Request Body:**
```json
{
  "companyCode": "required",
  "siteCode": "required",
  "timestamp_ms": "required",
  "selectedFiles": ["file1.log", "file2.log"]
}
```

### Test Results Endpoints

#### Get Test Results

**POST** `/test-results`

Parse and return test results from logs.

**Request Body:**
```json
{
  "siteId": "optional",
  "companyId": "optional",
  "companyCode": "optional",
  "siteCode": "optional",
  "processed_files": ["file1.log", "file2.log"]
}
```

**Response:**
```json
{
  "message": "Test results fetched successfully",
  "data": {
    "data": {
      "runWorkflow": {
        "stepResults": [
          {
            "stepId": "parse_logs",
            "stepInfo": "Parsed test results from logs",
            "result": "{\"data\":{\"response\":{\"testInfo\":{...}}}}",
            "metricSummary": null
          }
        ],
        "status": "success",
        "message": "Test results parsed successfully"
      }
    }
  }
}
```

### Data Management Endpoints

#### Clear All Data

**POST** `/clear-data/`

Clear all stored logs and sessions.

**Response:**
```json
{
  "message": "All data cleared successfully"
}
```

#### Clear File Data

**GET** `/clear-file-data/`

Clear data for a specific file.

**Query Parameters:**
- `filename` (required): Name of the file to clear

**Response:**
```json
{
  "message": "Data cleared for file: log_file.log",
  "remaining_logs": 100,
  "remaining_sessions": 3
}
```

### Health Check

**GET** `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "total_logs": 1500
}
```

---

## Frontend Components

### Page Components

#### UploadPage (`/`)

Main file upload interface.

**Features:**
- Drag & drop file upload
- Local file upload
- S3 file selection
- File list with status tracking
- Progress indicators
- Start analysis button

**State Management:**
- Uses session storage for persistence
- Tracks uploaded files and their status
- Manages S3 site selection and file processing

#### LoadingPage (`/loading`)

Analysis loading screen.

**Features:**
- Loading animation
- Automatic navigation to insights after processing
- Data fetching from backend

#### InsightsPage (`/insights`)

Log analysis and insights display.

**Features:**
- Device statistics
- Session summaries
- Navigation flowchart
- Log entries display
- Filtering and search

#### TestStatsPage (`/tests`)

Test statistics and results.

**Features:**
- Test completion statistics
- Test status breakdown (completed, incomplete, aborted, deleted)
- Per-file test counts

#### FullLogFilePage (`/full-log`)

Full log file viewer.

**Features:**
- Complete log file display
- Search functionality
- Syntax highlighting
- File selection (if multiple files)
- Download capability

#### HistoryPage (`/history`)

Historical data view.

**Features:**
- Past analysis results
- Historical session data

### Reusable Components

#### FileUpload

File upload component with drag & drop support.

**Props:**
- `onFileSelect`: Callback when files are selected
- `onS3FileSelect`: Callback for S3 file selection
- `disabled`: Disable upload

#### LogFilesList

List of uploaded log files with status.

**Props:**
- `files`: Array of file objects
- `onFileRemove`: Callback for file removal
- `onStartAnalysis`: Callback to start analysis

#### LogInsights

Main insights display component.

**Props:**
- `logsData`: Array of log entries
- `uploadedFiles`: Array of uploaded files
- `onGoBack`: Navigation callback

#### TestStats

Test statistics display component.

**Props:**
- `testInfo`: Test information object
- `files`: Array of file names

#### Header

Application header with navigation.

**Features:**
- Logo/branding
- Navigation links
- Active route highlighting
- Reset functionality

### UI Components

Located in `components/ui/`:

- **Button**: Styled button component
- **Card**: Card container component
- **Badge**: Badge/label component
- **Avatar**: Avatar/image component
- **Breadcrumb**: Breadcrumb navigation
- **Progress**: Progress bar component

---

## Data Flow

### File Upload Flow

```
1. User selects files (local or S3)
   ↓
2. Files added to state with "uploading" status
   ↓
3. POST /read-log/ or /s3/process-selected-files
   ↓
4. Backend decrypts and processes logs
   ↓
5. Logs stored in logs_storage
   ↓
6. Sessions extracted and stored in sessions_storage
   ↓
7. Response returned with success status
   ↓
8. Frontend updates file status to "completed"
   ↓
9. Files saved to session storage
```

### Analysis Flow

```
1. User clicks "Start Analysis"
   ↓
2. Navigate to /loading
   ↓
3. Fetch logs from backend (GET /logs/paginated)
   ↓
4. Navigate to /insights with data
   ↓
5. Display insights:
   - Device statistics
   - Session summaries
   - Navigation flowchart
   - Log entries
```

### S3 Integration Flow

```
1. User opens S3 modal
   ↓
2. Fetch sites (POST /s3/log)
   ↓
3. User selects site
   ↓
4. Fetch log files (POST /s3/log/{site_id})
   ↓
5. User generates decrypted logs (POST /s3/log/{site_id}/generate)
   ↓
6. List ZIP files (POST /s3/list-zip-files)
   ↓
7. User selects files
   ↓
8. Process selected files (POST /s3/process-selected-files)
   ↓
9. Files processed and added to logs_storage
```

---

## Key Functionalities

### Log Decryption

The application uses AES decryption compatible with CryptoJS format:

```python
def cryptojs_decrypt(passphrase: str, ciphertext: str) -> str:
    # Decrypts base64-encoded CryptoJS ciphertext
    # Uses MD5 key derivation with salt
    # Returns decrypted UTF-8 string
```

**Passphrase**: `"ecsite"` (configurable)

### Device Detection

Device IDs are extracted using regex pattern:
```
DEVICE ID\s+([A-Z0-9\-]+)
```

### Session Detection

Sessions are identified by:
- **Start**: `"LOG-APP"` in message and `"App Version"` in message
- **Tracking**: All logs between session starts belong to the same session
- **Screens**: Extracted from `NAVIGATE-TO` events

### Test Result Parsing

Test events are parsed from `TESTING-INFO` messages:

**Pattern:**
```
TESTING-INFO : { details : Test Started/Completed/Deleted , info : {...} }
```

**Status Detection:**
- **Started**: "test started" in details
- **Completed**: "test completed" in details
- **Aborted**: "test aborted" in details (requires preceding "INFO : Aborted")
- **Stopped**: "test stopped" in details
- **Deleted**: "test deleted" in details

**Test ID Extraction:**
- Extracted from `info` JSON: `testProfileTestItemId`

### Navigation Flowchart Generation

**Process:**
1. Normalize logs by session and device
2. Extract screen names from `NAVIGATE-TO` events
3. Build transition matrix between screens
4. Calculate statistics (frequency, event counts)
5. Generate nodes and edges for visualization

**Login Detection:**
- Pattern: `LOG-APP.*Model Name`
- Creates synthetic "login" node
- Tracks login → first screen transitions

---

## Configuration

### Backend Configuration

**File**: `backend/app.py`

**Key Settings:**
```python
PASS_PHRASE = "ecsite"  # Encryption passphrase

# CORS settings
allow_origins=["*"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]

# Server settings
host="0.0.0.0"
port=8000
```

**External API Configuration:**
```python
# Authentication endpoint
auth_url = "https://cloud-uat-api.ecsiteapp.com/api/users/authenticate"

# GraphQL endpoint
graphql_url = "https://cloud-uat-api.ecsiteapp.com/api/graphql"

# S3 bucket
default_bucket = "ecsite-cloud-uat"
```

### Frontend Configuration

**File**: `frontend/src/config/api.js`

**API Base URL:**
- Automatically detects hostname
- Uses environment variable `VITE_API_BASE` if set
- Defaults to `http://127.0.0.1:8000` for localhost

**Environment Variables:**
```bash
VITE_API_BASE=http://your-api-url:8000
```

### Session Storage Keys

- `uploadedLogFiles`: Array of uploaded file metadata
- `processedFiles`: Array of processed S3 file paths

---

## Usage Guide

### Basic Usage

1. **Start the Application**
   ```bash
   ./start.sh
   ```

2. **Upload Log Files**
   - Navigate to `http://localhost:5173`
   - Drag & drop files or click to select
   - Wait for processing to complete

3. **View Analysis**
   - Click "Start Analysis" button
   - View insights on the insights page

4. **Explore Features**
   - Filter by device
   - View navigation flowchart
   - Check test statistics
   - View full log files

### S3 Integration Usage

1. **Select S3 Source**
   - Click "Select from S3" button
   - Select a site from the list
   - Choose user and device (if applicable)

2. **Generate Decrypted Logs**
   - Click "Generate Decrypted Logs"
   - Wait for processing
   - Select files from ZIP archive

3. **Process Files**
   - Select desired files
   - Click "Process Selected Files"
   - Files will be processed and added to analysis

### Advanced Usage

**Filter Logs by Device:**
- Use device filter in insights page
- Or use API: `GET /logs?device_id=DEVICE-001`

**View Specific Session:**
- Use session filter
- Or use API: `GET /logs/paginated?session_id=1`

**Search in Logs:**
- Use search bar in full log file page
- Search is case-insensitive
- Highlights matching terms

**Export Data:**
- Use download button in full log file page
- Or use API endpoints to fetch data programmatically

---

## Development Guide

### Adding New Features

#### Backend

1. **Add New Endpoint:**
   ```python
   @app.get("/new-endpoint")
   async def new_endpoint():
       return {"message": "Success"}
   ```

2. **Add Data Processing:**
   - Extend `logs_storage` or `sessions_storage`
   - Add processing logic in relevant endpoint

3. **Test Endpoint:**
   - Add test in `test_backend.py`
   - Or use Swagger UI at `/docs`

#### Frontend

1. **Add New Page:**
   ```jsx
   // Create component in pages/
   export function NewPage() {
     return <div>New Page</div>
   }
   
   // Add route in App.jsx
   <Route path="/new-page" element={<NewPage />} />
   ```

2. **Add New Component:**
   - Create in `components/` directory
   - Use existing UI components from `components/ui/`

3. **Add API Integration:**
   ```jsx
   import axios from "axios"
   import { API_BASE } from "../config/api"
   
   const response = await axios.get(`${API_BASE}/new-endpoint`)
   ```

### Code Style

**Backend:**
- Follow PEP 8 style guide
- Use type hints
- Document functions with docstrings

**Frontend:**
- Use functional components with hooks
- Follow React best practices
- Use Tailwind CSS for styling

### Testing

**Backend Testing:**
```bash
cd backend
source venv/bin/activate
python test_backend.py
```

**Frontend Testing:**
- Manual testing in browser
- Use browser DevTools for debugging
- Check console for errors

### Debugging

**Backend:**
- Check console output
- Use FastAPI's automatic documentation
- Add print statements for debugging

**Frontend:**
- Use browser DevTools
- Check Network tab for API calls
- Use React DevTools extension
- Check console for errors

---

## Troubleshooting

### Common Issues

#### Backend Won't Start

**Problem**: Port 8000 already in use

**Solution**:
```bash
# Find process using port 8000
lsof -i :8000  # Mac/Linux
netstat -ano | findstr :8000  # Windows

# Kill process or change port in app.py
```

#### Frontend Can't Connect to Backend

**Problem**: CORS or network issues

**Solution**:
- Check backend is running
- Verify API_BASE in `config/api.js`
- Check CORS settings in backend
- Use browser DevTools Network tab

#### Files Not Uploading

**Problem**: File size or format issues

**Solution**:
- Check file format (should be encrypted log file)
- Verify file isn't corrupted
- Check backend logs for errors

#### Decryption Fails

**Problem**: Wrong passphrase or invalid format

**Solution**:
- Verify passphrase in `app.py`
- Check log file format
- Ensure file is properly encrypted

#### S3 Integration Issues

**Problem**: Authentication or API errors

**Solution**:
- Check authentication credentials
- Verify network connectivity
- Check API endpoint URLs
- Review backend logs for errors

### Performance Optimization

**For Large Log Files:**
- Use pagination (default: 250 logs per page)
- Filter by device or session
- Process files in batches

**For Multiple Files:**
- Process files sequentially
- Clear old data before new uploads
- Use file-specific data clearing

### Getting Help

1. **Check Logs**: Review backend console and browser console
2. **API Documentation**: Visit `/docs` for endpoint details
3. **Code Comments**: Review inline code comments
4. **Error Messages**: Read error messages carefully

---

## Additional Resources

### API Documentation

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

### Related Documentation

- `README.md`: Quick start guide
- `ROUTING_SUMMARY.md`: Routing details
- `NETWORK_ACCESS.md`: Network configuration
- `SETUP_COMPLETE.md`: Setup verification

### External Dependencies

- **FastAPI**: https://fastapi.tiangolo.com/
- **React**: https://react.dev/
- **Tailwind CSS**: https://tailwindcss.com/
- **React Router**: https://reactrouter.com/

---

## Version History

### Current Version

- **Backend**: FastAPI 0.117.1
- **Frontend**: React 19.1.1
- **Python**: 3.12+
- **Node.js**: 18+

### Feature Updates

- ✅ Encrypted log processing
- ✅ Device-based organization
- ✅ Session tracking
- ✅ Test results analysis
- ✅ Navigation flowchart
- ✅ S3 integration
- ✅ Full log file viewer
- ✅ Search functionality
- ✅ Pagination support
- ✅ State persistence

---

## License

This project is licensed under the MIT License.

---

## Support

For issues, questions, or contributions, please refer to the project repository or contact the development team.

---

**Last Updated**: 2024
**Documentation Version**: 1.0

