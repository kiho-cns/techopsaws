# ERP_TECHOPS_LEADER_AWS 기술 아키텍처 요약

## 1. 개요

`ERP_Techops_leader_AWS`는 ERP TECHOPS 팀이 사용하는 내부 내비게이션 포털입니다.  
이 프로젝트는 백엔드 비즈니스 로직 서버가 아닌, 정적 페이지 중심의 링크 허브로 운영됩니다.

현재 운영 구성:

- 프론트엔드: 정적 `HTML/CSS/Vanilla JS`
- 메인 화면: `index.html` (Single Page)
- 정적 리소스: `assets/`
- 배포 대상: `AWS EC2 + Nginx`
- 형상관리/배포: `GitHub + GitHub Actions`

## 2. 실행 구조

### Frontend Layer

- `index.html`
- 역할:
  - 팀/파트별 탭 UI 렌더링
  - 링크 카드/즐겨찾기/모니터링 섹션 제공
  - 사용자 클릭 기반 외부 시스템 이동

### Static Asset Layer

- `assets/*`
- 역할:
  - 로고/아이콘 등 UI 리소스 제공

### Web Serving Layer

- `Nginx` (`EC2`)
- 역할:
  - `/usr/share/nginx/html`에서 정적 파일 서빙
  - 외부 HTTP 요청 처리

## 3. 저장소 구조

- `index.html`: 메인 내비게이션 화면
- `assets/`: 이미지/브랜드 리소스
- `.github/workflows/deploy-ec2.yml`: EC2 배포 파이프라인
- `.github/workflows/deploy-pages.yml`: GitHub Pages 배포 파이프라인
- `README.md`: 프로젝트 기본 설명
- `vercel.json`: 정적 호스팅 관련 설정 파일

## 4. 데이터 특성

이 프로젝트는 별도 DB/API를 사용하지 않으며, 화면 구성 데이터(링크/텍스트)가 `index.html`에 정적으로 포함됩니다.

- 서버측 동적 데이터 처리: 없음
- 애플리케이션 상태 저장소: 없음
- 런타임 API 통신: 없음(링크 이동 중심)

## 5. 배포 구조 (EC2 기준)

### 배포 대상 경로

- 중간 업로드 경로: `/home/ec2-user/erpdash`
- Nginx 서비스 경로: `/usr/share/nginx/html`

### 배포 순서

1. GitHub Actions가 `index.html, assets`를 EC2로 SCP 업로드
2. 업로드 파일을 Nginx 웹루트로 복사
3. 권한(`nginx:nginx`) 재설정
4. `nginx` 재시작

## 6. CI/CD 구성

### 6.1 EC2 배포 워크플로우

파일: `.github/workflows/deploy-ec2.yml`

트리거:
- `main` 브랜치 push
- 수동 실행 (`workflow_dispatch`)

핵심 액션:
- `actions/checkout@v4`
- `appleboy/scp-action@v0.1.7`
- `appleboy/ssh-action@v1.0.3`

필수 Secrets:
- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `EC2_PORT` (옵션, 기본 22)

### 6.2 GitHub Pages 워크플로우

파일: `.github/workflows/deploy-pages.yml`

용도:
- 동일 콘텐츠를 GitHub Pages 환경에도 배포 가능하도록 구성

## 7. AWS 운영 포인트

- 인스턴스: EC2 (Amazon Linux 계열 운영)
- 웹서버: `nginx`
- 점검 우선순위:
  - `nginx` 프로세스 상태
  - `/usr/share/nginx/html/index.html` 반영 여부
  - 배포 워크플로우 실행 로그
  - 보안그룹 인바운드(HTTP/SSH) 설정

## 8. 변경 작업 가이드

### UI/링크 수정

- 수정 파일: `index.html` (필요 시 `assets/` 포함)
- 로컬 확인: 정적 서버 (`python -m http.server`)로 미리보기

### 반영 절차

1. 로컬 수정
2. 검증
3. `commit` / `push`
4. Actions 배포 확인
5. EC2 서비스 페이지 검증

## 9. 장애 대응 체크리스트

- 화면이 예전 상태로 보일 때:
  - 브라우저 강력 새로고침 (`Ctrl+F5`)
  - EC2 웹루트 파일 최신 여부 확인
- 배포 실패 시:
  - GitHub Actions 로그 확인
  - Secrets 값/키 권한 확인
  - SSH 접속 및 파일 권한 확인

## 10. 향후 개선 포인트

- `Nginx 80/443 + HTTPS` 표준화
- 링크/메뉴를 JSON 분리하여 관리성 향상
- UI 텍스트 다국어/인코딩 검증 자동화
- 배포 후 자동 헬스체크 및 롤백 체계 강화
