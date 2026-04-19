# ERP_TECHOPS_LEADER_AWS Architecture Flow

## 1. Purpose
- This project is a single-page operations hub for ERP TECHOPS.
- It provides quick access links by team (MSM / BC / TA / Common / Etc).
- It includes two interactive features:
- Emergency incident message popup (Slack webhook delivery via API).
- Notice panel + notice popup (leader password protected update).

## 2. Runtime Architecture
1. User opens dashboard in browser.
2. Nginx serves static files (`index.html`, `assets/*`).
3. Browser calls same-origin API for dynamic actions:
- `POST /api/incidents` for emergency Slack send.
- `GET /api/notice` for current notice text.
- `POST /api/notice` for notice update (password check).
4. Node/Express (`server.js`) handles API and stores runtime data under `data/`.

## 3. Deployment Flow (GitHub -> EC2)
1. Push to `main`.
2. GitHub Actions (`.github/workflows/deploy-ec2.yml`) uploads app files to EC2.
3. SSH step installs dependencies and restarts `erpdash-api` systemd service.
4. Nginx serves static page and proxies `/api/*` to Node app (`127.0.0.1:3000`).

## 4. Data and State
- Server-side files:
- `data/incidents.json`: incident send history.
- `data/notice.json`: shared notice text.
- Client-side localStorage:
- Notice panel collapsed state.
- "Do not show notice again today" date key.

## 5. Key External Links Category
- MSM: effort/weekly report/dashboard links.
- BC: Jira links.
- TA: monitoring + team operational links.
- Common: favorites and shared operational links.

## 6. Operational Checklist
- If page is slow: check image size and browser cache.
- If Slack send fails: verify `SLACK_WEBHOOK_URL` in EC2 `.env`.
- If notice update fails: verify `NOTICE_ADMIN_PASSWORD` in EC2 `.env`.
- If API fails: check `systemctl status erpdash-api` and `/api/health`.
