# 아키텍처

## 이 문서를 볼 때

프론트엔드 파일을 고치거나, 서버·Docker·nginx 설정을 만질 때 본다. 게임 규칙은 [게임 플레이](./GAMEPLAY.md), 테이블과 맵 저장 형식은 [DB와 JSON 구조](./DATABASE_AND_JSON.md)를 참고한다.

## 현재 구성

| 구분 | 사용 기술 | 역할 |
| --- | --- | --- |
| 화면 | React + Vite | 랜딩/로비/맵 목록/에디터 화면 전환, 각 화면의 2D UI(패널, 모달, 폼) |
| 3D 공간 | Three.js (바닐라, react-three-fiber 미사용) | 맵, 캐릭터, 카메라, 이동, 오브젝트 표시·편집 |
| 웹 서버 | 호스트 nginx | HTTPS 처리와 정적 파일 제공 |
| 데이터 저장 (현재) | 브라우저 `localStorage` | 맵 목록(`data/maps.js`)과 맵 안의 방/오브젝트 데이터(`editor/persistence.js`) 전부 지금은 여기 저장된다. 계정도 로그인도 없어서, 저장된 데이터는 그 브라우저에서만 보인다. |
| 데이터베이스 (인프라만 준비됨) | PostgreSQL Docker 컨테이너 (`compose.yaml`) | 컨테이너 자체는 띄울 수 있게 설정돼 있지만, **앱 코드는 아직 여기에 전혀 접속하지 않는다.** 로그인/백엔드 API가 생기고 나서 `localStorage`를 대체할 예정 — 자세한 전환 계획은 [맵 배포](./MAP_DEPLOY.md) 참고. |

## 코드 위치

```text
~/app/escapetheroom
├─ src/
│  ├─ App.jsx           화면 전환(랜딩 → 로비/맵 목록 → 에디터)
│  ├─ main.jsx          React 시작 파일
│  ├─ style.css         전체 화면 스타일
│  ├─ screens/          화면 단위 React 컴포넌트
│  │  ├─ Landing.jsx
│  │  ├─ Lobby.jsx
│  │  ├─ MapList.jsx    맵 생성/목록/메타데이터 수정 모달
│  │  └─ Editor.jsx     에디터 화면 뼈대(JSX skeleton) — 실제 3D/편집 로직은 아래 editor/에 위임
│  ├─ data/
│  │  └─ maps.js        맵 목록 CRUD (지금은 localStorage 기반)
│  └─ editor/           Three.js 에디터 본체 — React가 아니라 바닐라 JS 모듈
│     ├─ index.js       createScene(canvas, mapId) 진입점, 각 initXxx(ctx) 초기화 순서 관리
│     ├─ dom.js         DOM 요소 쿼리 + ctx에 담기
│     ├─ persistence.js 저장/복원(localStorage), 방 지연 로딩
│     ├─ core/          모드 전환, 카메라, 이동/충돌, 방 생성 도구, 중력, 선택 외곽선
│     ├─ assets/        GLB 카탈로그 로딩, 오브젝트 배치
│     ├─ left-sidebar/  에셋 브라우저, 미리보기
│     └─ right-sidebar/ 하이라키, 인스펙터, 상호작용 탭, 방 목록
├─ public/
│  └─ models/assets/    카테고리별 GLB(office/, character/, tiles/ 등) + 자동 생성되는 인덱스 JSON
├─ scripts/
│  └─ generate-asset-index.mjs   public/models/assets/를 스캔해서 카탈로그 인덱스 생성 (빌드 전 자동 실행)
├─ md/                  프로젝트 문서
└─ compose.yaml         PostgreSQL Docker 설정 (인프라만, 아직 앱에서 미사용)
```

## 프론트엔드 동작 방식

React가 화면 전환(랜딩/로비/맵 목록/에디터)과 그 안의 2D UI(폼, 모달, 사이드바 DOM 뼈대)를 담당한다. `Editor.jsx`는 `<canvas>` 하나를 만들고 `createScene(canvas, mapId)`를 호출하는 것으로 끝나고, 그 이후 3D 씬 조작·카메라·오브젝트 배치·저장/복원 같은 실질적인 로직은 전부 `src/editor/` 아래 바닐라 JS 모듈들이 처리한다(react-three-fiber를 안 쓰는 이유는 캐릭터 이동/드래그 재부모화/커스텀 충돌처럼 명령형으로 씬을 직접 조작하는 코드가 압도적으로 많아서다).

`src/editor/` 내부는 클래스나 전역 상태 대신, `createScene()`이 호출될 때마다 새로 만들어지는 평범한 객체 `ctx`(서비스 로케이터)에 각 `initXxx(ctx)` 모듈이 함수/상태를 직접 얹는 패턴을 쓴다. 맵을 바꿔 다시 `createScene()`을 호출해도 이전 맵의 상태가 안 남고 완전히 새로 시작된다.

## 서버와 배포

소스 코드는 `~/app/escapetheroom`에 둔다. `npm run build`를 실행하면 `dist/` 폴더에 배포할 파일이 만들어진다.

nginx는 `/var/www/escapetheroom`을 외부에 제공한다. 배포할 때는 `dist/`의 내용을 이 폴더로 복사한다.

```text
인터넷
  → nginx : 443
  → /var/www/escapetheroom 의 정적 파일
```

백엔드를 만들면 nginx의 `/api/`, `/socket.io/` 요청을 `127.0.0.1:3100`으로 넘긴다. 이 포트는 외부에 직접 열지 않는다.

## PostgreSQL

PostgreSQL은 Docker에서 실행한다.

```text
호스트 127.0.0.1:5433 → Docker PostgreSQL 5432
```

서버 안에서는 DBeaver SSH 터널이나 `docker exec`로 접속할 수 있다. 테이블 구조는 [DB와 JSON 구조](./DATABASE_AND_JSON.md)에 정리한다.

## 개발과 배포 명령

```bash
cd ~/app/escapetheroom
npm ci
npm run build
```

정적 파일 배포:

```bash
sudo rm -rf /var/www/escapetheroom/*
sudo cp -r dist/* /var/www/escapetheroom/
```

nginx 설정을 바꾼 경우에만 아래 명령을 실행한다.

```bash
sudo nginx -t && sudo systemctl reload nginx
```
