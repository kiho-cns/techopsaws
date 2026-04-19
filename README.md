# ERP TECHOPS LEADER AWS

Single-page team dashboard with lightweight Node API for:
- Emergency incident Slack delivery
- Shared notice read/update

## Run Local
1. `npm install`
2. Copy `.env.example` to `.env`
3. Set values in `.env`:
- `PORT=5000`
- `SLACK_WEBHOOK_URL=...` (required for live Slack send)
- `NOTICE_ADMIN_PASSWORD=leader_yang` (change for production)
4. `npm start`
5. Open `http://127.0.0.1:5000`

## API
- `GET /api/health`
- `POST /api/incidents`
- `GET /api/notice`
- `POST /api/notice`

## Deploy
- CI/CD workflow: `.github/workflows/deploy-ec2.yml`
- Target server path: `/home/ec2-user/erpdash`
- Nginx serves static files and proxies `/api/*` to Node.

## Architecture Note
- High-level architecture flow: `ERP_TECHOPS_LEADER_AWS_Architecture_Flow.md`
