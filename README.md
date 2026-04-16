# ERP TECHOPS TEAM Navigation

Single-page navigation for the ERP TECHOPS team.

## Files

- `index.html`: main navigation page
- `server.js`: static serving + `/api/incidents` emergency Slack API

## Local Run

1. `npm install`
2. `.env.example`를 복사해 `.env` 생성
3. `SLACK_WEBHOOK_URL` 설정 (미설정 시 전송 실패 처리)
4. 필요 시에만 `ALLOW_SIMULATED_SEND=true` 사용
5. `npm start`
6. 접속: `http://127.0.0.1:5000`

## EC2 CI/CD Notes

- GitHub Actions `deploy-ec2.yml`는 정적 페이지 + Incident API(`server.js`)를 함께 배포합니다.
- Nginx는 `/api/*`를 내부 Node API(`127.0.0.1:3000`)로 프록시합니다.
- GitHub Secrets 필수:
  - `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (기존)
  - `EC2_SLACK_WEBHOOK_URL` (긴급 슬랙 전송용)
