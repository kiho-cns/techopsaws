# ERP_TECHOPS_LEADER_AWS 아키텍처/기능 플로우 원페이저

이 프로젝트는 `index.html` 단일 정적 페이지를 중심으로, ERP TECHOPS 팀의 운영 링크를 파트별로 집약한 내비게이션 허브다. 사용자는 브라우저로 EC2의 Nginx 엔드포인트(`http://3.37.240.172`)에 접속하고, Nginx는 `/usr/share/nginx/html`에 배포된 `index.html`과 `assets/*`를 서빙한다. 화면은 `MSM / BC / TA / 공통 / 기타` 섹션 구조로 동작하며, 각 카드/링크 클릭 시 외부 운영 시스템(내부 대시보드, SharePoint, Confluence, Jira, Grafana, Sherpa, 메일)으로 이동하는 형태다. 즉, 이 서비스의 핵심 기능은 “업무 진입점 통합”이며, 앱 내부 데이터 처리나 서버사이드 비즈니스 로직은 없다.

코드 저장소 관점에서 핵심 컴포넌트는 `index.html`(UI/링크 정의), `assets/`(브랜드 이미지), `.github/workflows/deploy-ec2.yml`(실서비스 배포), `.github/workflows/deploy-pages.yml`(Pages 배포)이다. 개발자가 로컬에서 `index.html`을 수정해 `main` 브랜치에 push하면 GitHub Actions가 실행되어 `index.html, assets`를 EC2의 `/home/ec2-user/erpdash`로 SCP 업로드하고, SSH 단계에서 이를 `/usr/share/nginx/html`로 복사한 뒤 `nginx`를 재시작한다. 결과적으로 사용자 트래픽은 항상 Nginx 정적 파일 버전에 수렴하며, 배포 파이프라인은 “GitHub(main) → Actions → EC2 업로드 경로 → Nginx 웹루트 → 최종 사용자”의 선형 흐름이다.

기능/링크 플로우를 한눈에 보면 다음과 같다. `MSM`은 내부 Effort 대시보드(`10.64.130.15:5000`), GDN 대시보드(`3.37.240.172:5000`), SharePoint 입력 링크(다수), MSM 주간보고(Confluence)로 연결된다. `BC`는 Wire-work(Jira) 진입점으로 연결된다. `TA`는 Wire-work(Jira)와 `모니터링-LG전자` 블록( LG전자 Sherpa, LG전자 Grafana URL Health Check )으로 구성된다. `공통-즐겨찾기`는 고객사 주요 변경작업/재택 현황/MRO 요청(Confluence)으로 연결된다. `기타`는 상암 점심 메뉴 추천 페이지로 이동한다. 우하단 FAB 메일 버튼은 `choimaest@lgcns.com` 수정요청 메일 작성으로 이어진다.

아키텍처 다이어그램을 그릴 때는 4개 레이어로 표현하면 된다: `User Browser Layer`(탭/카드 클릭), `Web Serving Layer`(EC2 Nginx 정적 서빙), `Delivery Layer`(GitHub Actions EC2 배포), `External Service Layer`(Jira/Confluence/SharePoint/Grafana/Sherpa/내부 대시보드/메일). 특히 이 시스템은 “정적 허브 + 외부 시스템 라우팅” 모델이므로, 상태 저장/도메인 로직보다 “링크 거버넌스, 배포 신뢰성, 접근 네트워크(사내망/퍼블릭망)”가 운영 핵심 포인트다.
