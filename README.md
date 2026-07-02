# Attendance App — Google Sheets Backend

Full-stack PWA attendance system: **React + Vite** frontend, **FastAPI** backend, **Google Sheets** as the sole database.

---

## Google Sheets Setup (Required — do this first)

### Step 1 — Create a Google Cloud Service Account

1. Go to https://console.cloud.google.com/
2. Create a project (or use an existing one)
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it any name, click **Done**
6. Click the service account → **Keys → Add Key → JSON** → download the file
7. Save it as `service_account.json` inside the `backend/` folder

### Step 2 — Create your Google Spreadsheet

1. Go to https://sheets.google.com and create a **blank spreadsheet**
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit`
3. Share the spreadsheet with your service account email
   (it looks like `something@project.iam.gserviceaccount.com`) — give **Editor** access

### Step 3 — Set Environment Variables

```bash
# Option A — point to the JSON file
export GOOGLE_SHEETS_CREDS_JSON=/path/to/service_account.json

# Option B — paste the raw JSON as a string
export GOOGLE_SHEETS_CREDS_JSON='{"type":"service_account","project_id":...}'

export GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
```

On first startup the backend **auto-creates all tabs** with headers and seeds:
- Default admin: phone `9999999999`
- Branch: `Head Office`
- Department: `General`

---

## Running (Development)

```bash
# Terminal 1 — Backend
cd attendance-app/backend
pip install -r requirements.txt
export GOOGLE_SHEETS_CREDS_JSON=/path/to/service_account.json
export GOOGLE_SPREADSHEET_ID=your_id
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd attendance-app/frontend
npm install
npm run dev
# Visit http://localhost:5173
```

---

## Running (Docker)

```bash
# Create a .env file in the project root:
GOOGLE_SHEETS_CREDS_JSON=/run/secrets/gsheets_creds
GOOGLE_SPREADSHEET_ID=your_id

docker-compose up --build
```

Or pass credentials directly via docker-compose environment:

```yaml
environment:
  - GOOGLE_SHEETS_CREDS_JSON={"type":"service_account",...}
  - GOOGLE_SPREADSHEET_ID=your_id
```

---

## Default Login

| Phone | Role |
|-------|------|
| `9999999999` | Admin |

Add employees in **Admin → Settings → Employee Management**.

---

## Google Sheets Tab Structure

| Tab | Columns |
|-----|---------|
| `employees` | id, name, phone, role, department, branch, designation, created_at |
| `attendance` | id, emp_id, emp_name, punch_type, timestamp, lat, lng, status, distance_from_office |
| `settings` | key, value |
| `branches` | id, name |
| `departments` | id, name |
| `notes` | id, content, posted_by, date, created_at |
| `reports` | id, name, type, month, branch, department, generated_at, file_path |

All data is live in Google Sheets — you can view, filter, and even manually edit it there.

---

## Project Structure

```
attendance-app/
├── backend/
│   ├── main.py
│   ├── models/sheets.py       ← ALL data access (replaces SQLite)
│   ├── routers/
│   │   ├── auth.py
│   │   ├── attendance.py      ← punch + geofence
│   │   ├── employees.py
│   │   ├── notes.py
│   │   ├── reports.py         ← XLS generation
│   │   └── settings.py
│   ├── utils/auth.py          ← JWT (never expires)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── context/           ← Auth, Toast
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── employee/      ← Mark, History, Profile
│   │   │   └── admin/         ← Staff, Attendance, Reports, Settings
│   │   └── utils/api.js
│   ├── vite.config.js         ← PWA + proxy
│   └── Dockerfile
└── docker-compose.yml
```

---

## Features

### Employee App
- GPS punch in/out with dark Leaflet map + teal geofence circle
- Geofence enforcement + mock GPS rejection + WiFi IP lock
- Monthly attendance calendar (tap date → punch times)
- Read-only profile

### Admin App  
- Staff directory → per-employee calendar + stats
- Daily attendance view with dept/branch filters
- 8 report types → XLS download (SalaryBox format)
- Settings: company, geofence, hours, branches, depts, employees, notes

---

## PWA Install

Android: Chrome → ⋮ → Add to Home Screen  
iPhone: Safari → Share → Add to Home Screen
