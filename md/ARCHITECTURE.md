# 아키텍처

## 이 문서를 볼 때

프론트엔드나 백엔드 파일을 고치거나, 서버·Docker·nginx 설정을 만질 때 본다. 게임 규칙은 [게임 플레이](./GAMEPLAY.md), 테이블과 맵 저장 형식은 [DB와 JSON 구조](./DATABASE_AND_JSON.md), 배포 기능은 [맵 배포](./MAP_DEPLOY.md)를 참고한다.

## 현재 구성

| 구분 | 사용 기술 | 역할 |
| --- | --- | --- |
| 화면 | React + Vite | 화면 전환(랜딩/로그인/방 목록/방 만들기/맵 목록/에디터)과 각 화면의 2D UI |
| 3D 공간 | Three.js (바닐라, react-three-fiber 미사용) | 맵, 캐릭터, 카메라, 이동, 오브젝트 표시·편집 |
| 웹 서버 | 호스트 nginx | HTTPS, 정적 파일 제공, `/api/`와 `/socket.io/`를 백엔드로 프록시 |
| 백엔드 | NestJS 11 + TypeORM + socket.io (Docker 컨테이너 `escapetheroom-backend`) | 계정 인증, 맵 저장/불러오기, 배포, 공유 코드 조회, 게임방과 실시간 연결 |
| 데이터베이스 | PostgreSQL 16 (Docker `escapetheroom-postgres`) | 계정, 맵 작업본, 배포본 |
| 캐시/실시간 상태 | Redis 7 (Docker `escapetheroom-redis`) | 게임방 목록과 참가자, 요청 횟수 제한. 게임 진행 상태(열린 문 등)는 설계만 있음 |
| 브라우저 저장소 | `localStorage` | 최근 플레이한 맵의 공유 코드 |

세 컨테이너는 `compose.yaml` 하나로 같이 관리하고 같은 네트워크에서 서비스 이름(`postgres`, `redis`)으로 서로를 찾는다. 호스트에는 `127.0.0.1`로만 포트가 열려 있다 — Postgres 5433, Redis 6380, 백엔드 3100 — 외부에서 직접 접근할 수 없다.

## 코드 위치

```text
~/app/escapetheroom
├─ src/                    프론트엔드
│  ├─ App.jsx              화면 전환 + 로그인 상태(user) 보관
│  ├─ screens/
│  │  ├─ Landing.jsx       메인 화면(3D 캐릭터 배경, 로그인/로그아웃, 게임 시작/맵 제작)
│  │  ├─ CharacterBackdrop.jsx   랜딩의 3D 배경
│  │  ├─ AuthModal.jsx     로그인/회원가입 모달
│  │  ├─ Lobby.jsx         방 목록 + 방 검색 + 선택한 방의 정보 사이드바 (2:1)
│  │  ├─ CreateRoom.jsx    방 만들기 ("내 게임" / "최근 플레이 게임" 탭)
│  │  ├─ GameRoom.jsx      방에 입장한 화면 — 왼쪽 3D 대기실(game/) + 오른쪽 대기자 목록, 소켓 연결, 방장 시작
│  │  ├─ MapList.jsx       내 맵 목록, 맵 정보 수정, 배포/공유 중단, 삭제
│  │  ├─ Editor.jsx        에디터 화면 뼈대(JSX) — 실제 로직은 editor/에 위임
│  │  └─ useBackdropDismiss.js   모달 바깥 클릭으로 닫기(드래그로 닫히지 않게)
│  ├─ data/                서버/브라우저 저장소 호출
│  │  ├─ auth.js           /api/auth/*
│  │  ├─ maps.js           /api/maps (+ 배포)
│  │  ├─ mapLibrary.js     최근 플레이 맵(localStorage) + 공유 코드 조회
│  │  ├─ gameRooms.js      /api/game-rooms (목록·검색·생성·닫기)
│  │  └─ gameRoomSocket.js 방 하나에 대한 실시간 연결(socket.io): 입장, 위치 전송, 시작, 이벤트 수신
│  ├─ engine/              에디터와 게임이 함께 쓰는 3D 부품 (에디터 화면 요소를 전혀 모른다)
│  │  ├─ scene-objects.js  렌더러·씬·조명·카메라 (editorTools 옵션으로 편집 도구를 켜고 끔)
│  │  ├─ lifecycle.js      정리 등록소: ctx.listen / ctx.addDisposer / ctx.dispose
│  │  ├─ input.js          포인터 피킹, 눌린 키 집합
│  │  ├─ camera-projection.js    화면 비율에 맞는 정사영 범위, 리사이즈 (창 전체 또는 캔버스 박스 기준)
│  │  ├─ name-tag.js       캐릭터 머리 위 이름표(스프라이트, 줌과 무관하게 같은 크기)
│  │  ├─ remote-players.js 다른 플레이어: 캐릭터 + 이름표, 서버가 중계한 위치로 부드럽게 이동
│  │  ├─ rooms.js          방 목록·현재 방·표시 전환
│  │  ├─ room-view.js      바닥·벽 생성(문 자리 비움), 카메라를 가리는 벽 투명화
│  │  ├─ room-doors.js     문 모델 배치, 문 너머 바닥 힌트
│  │  ├─ asset-loader.js   GLB 템플릿 로딩·복제
│  │  ├─ object-factory.js 저장된 항목 → 씬 오브젝트 (UI 없는 버전)
│  │  ├─ layout-loader.js  레이아웃 JSON → 방/오브젝트 (지연 로딩, 부모·잠금 버튼 연결)
│  │  ├─ character-rig.js  캐릭터 모델·애니메이션 — 모델은 한 번만 읽고 복제해서 쓴다(다른 플레이어용)
│  │  └─ player-controller.js    WASD·클릭 이동(A*), 충돌, 낙하, 스폰, 추적 카메라
│  ├─ game/                게임 클라이언트 (에디터 코드를 가져오지 않는다)
│  │  ├─ createGameScene.js      engine 부품만으로 장면을 조립, 내 위치를 일정 간격으로 내보냄, dispose 제공
│  │  └─ lobby-layout.js         모든 방이 시작하는 고정 대기실 레이아웃
│  └─ editor/              Three.js 에디터 — React가 아니라 바닐라 JS 모듈
│     ├─ index.js          createScene(canvas, mapId): engine 부품 + 편집 도구 조립, Ctrl+S, 종료 시 저장·정리
│     ├─ dom.js            에디터 DOM 요소 쿼리
│     ├─ persistence.js    서버 저장/불러오기, 10초 자동 저장
│     ├─ core/             모드 전환, 에디터 카메라, 방 그리기 도구, 플레이 테스트 상호작용(모달·문 규칙)
│     ├─ assets/           에셋 카탈로그, 배치(선택·하이라키·저장을 얹은 래퍼)
│     ├─ left-sidebar/     에셋 브라우저, 미리보기
│     └─ right-sidebar/    하이라키, 인스펙터, 상호작용 탭, 방 선택/삭제, 방 연결(문)
├─ backend/                NestJS 백엔드 (아래 참고)
├─ db/schema.sql           DB 스키마 원본 (실행하면 모든 테이블을 지우고 다시 만든다)
├─ public/models/assets/   카테고리별 GLB + 자동 생성되는 인덱스 JSON
├─ scripts/                에셋 인덱스 생성(빌드 전 자동 실행)
├─ md/                     프로젝트 문서
├─ compose.yaml            postgres + redis + backend
└─ .env / .env.example     비밀값(커밋하지 않음) / 필요한 키 목록
```

## 백엔드 구조

```text
backend/src
├─ main.ts            전역 prefix /api, cookie-parser, trust proxy(nginx 뒤)
├─ database/          TypeORM 연결 (synchronize 끔 — 스키마 원본은 db/schema.sql)
├─ redis/             ioredis 클라이언트
├─ auth/              회원가입·로그인·로그아웃·내 정보·게스트, argon2, JWT, 요청 횟수 제한, UserAuthGuard(회원만)/IdentityGuard(회원 또는 게스트)
├─ maps/              맵 CRUD·레이아웃 저장/불러오기·배포·공유 코드 조회 (엔티티는 db/schema.sql 테이블과 1:1)
└─ game-rooms/        게임방(Redis)과 실시간 연결: service(방·참가자·방장), controller(REST), gateway(socket.io)
```

### API

| 구분 | 엔드포인트 | 권한 |
| --- | --- | --- |
| 상태 | `GET /api/health` | 누구나 |
| 계정 | `POST /api/auth/signup`, `/login`, `/logout`, `/guest`, `GET /api/auth/me` | 누구나 (`me`는 비로그인이면 `{ user: null }`) |
| 맵 | `GET/POST /api/maps`, `GET/PATCH/DELETE /api/maps/:id` | 로그인 + **본인 맵만** |
| 레이아웃 | `GET/PUT /api/maps/:id/layout` | 로그인 + 본인 맵만 |
| 배포 | `POST/DELETE /api/maps/:id/deploy` | 로그인 + 본인 맵만 |
| 공유 코드 | `GET /api/shared-maps/:code`, `/:code/layout` | 누구나 |
| 저장한 맵 | `GET/POST/DELETE /api/me/saved-maps` | 로그인 (현재 화면은 사용 안 함) |
| 게임방 | `GET /api/game-rooms?q=`, `GET /api/game-rooms/:id` | 누구나 (게스트 포함) |
| 게임방 | `POST /api/game-rooms`, `DELETE /api/game-rooms/:id` | 회원 또는 게스트 (닫기는 방장만) |
| 게임방 | `GET /api/game-rooms/:id/layout` | 그 방에 입장한 사람만, 게임이 시작된 뒤에만 (문 비밀번호가 들어 있어서) |

남의 맵에 접근하면 403이 아니라 404를 돌려줘서 맵 id의 존재 여부를 알 수 없게 한다.

### 인증

- **JWT를 httpOnly 쿠키**(`et_token`, `Secure`, `SameSite=Lax`)로 발급한다. 일반 계정 7일, 게스트 12시간. 실시간 접속(소켓)도 연결할 때 이 토큰을 서명만 검증하면 되고, 서버에 세션을 저장하지 않는다.
- 즉시 무효화(강제 로그아웃, 차단)는 아직 지원하지 않는다. 필요해지면 Redis에 토큰 id 차단 목록을 두는 방식으로 보완한다.
- 비밀번호는 argon2id 해시로만 저장한다. 로그인 실패 메시지는 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일하고, 없는 이메일에도 해시 검증을 한 번 수행해 응답 시간으로 계정 존재 여부를 알 수 없게 한다.
- **로그인이 필요한 건 맵 제작뿐**이다. 게임(방 목록, 방 만들기, 플레이)은 비로그인으로 된다. 게스트는 닉네임만 받아 DB 행 없이 서명된 임시 토큰을 받는다(서버 API는 있고, 화면의 게스트 입장 UI는 방 입장 기능과 함께 만든다).
- 구글·네이버 소셜 로그인은 `users` 테이블 구조만 준비돼 있고 아직 구현 전이다.

## 게임방과 실시간 연결

**방은 서버(Redis)에 있어서 모두가 같은 목록을 본다.** 방을 만들면(REST) 서버가 맵 공유 코드로 맵 정보를 직접 읽어 방 카드에 복사하고(클라이언트가 보낸 맵 정보는 믿지 않는다), 만든 사람이 방장이 된다. 사람이 하나도 없는 방은 목록에 나오지 않고, 모두 나가면 30초 뒤(새로고침해서 바로 돌아올 수 있게), 만들고 아무도 들어오지 않으면 120초 뒤 사라진다. 서버를 재시작하면 소켓이 모두 끊기므로 남은 방도 모두 지운다.

입장과 이후는 socket.io(`/socket.io`, nginx가 이미 웹소켓을 넘긴다)로 한다. **연결할 때 로그인/게스트 쿠키(JWT)로 신원을 확인**하고, 쿠키가 없으면 연결 자체를 거절한다. 이름·id는 항상 서버가 쿠키에서 읽은 값이다.

| 방향 | 이벤트 | 내용 |
| --- | --- | --- |
| 클라이언트 → 서버 | `room:join {roomId}` | 응답으로 방 정보, 참가자, 이미 있는 사람들의 위치, 지금까지의 버튼/문 상태(`play`)를 받는다. 가득 찬 방(`full`), 시작된 방(`started`), 없는 방(`not_found`)은 거절 |
| | `player:move {x,z,ry,moving,room?}` | 내 위치(`room`은 맵 안에서 있는 방의 저장 id). 약 12회/초, 변화가 있을 때만 |
| | `room:start` | 방장만 가능 |
| | `room:positions` | 응답으로 모두의 마지막 위치 |
| | `room:clear` | 탈출구에 도달함. 진행 중인 방을 클리어 상태로 바꾸고 모두에게 알림(한 번만) |
| | `play:action {kind,key}` | 버튼을 눌렀다(`button`)/문을 풀었다(`door`). 서버가 Redis에 기록하고 처음 일어난 변화만 다른 사람에게 중계 |
| | `room:leave` | 연결이 끊겨도 같은 처리 |
| 서버 → 클라이언트 | `player:joined` / `player:left` | 참가자 변화 |
| | `player:moved {id,x,z,ry,moving,room?}` | 다른 사람의 위치 (보낸 사람에게는 돌려주지 않음) |
| | `play:state {kind,key}` | 다른 사람이 한 버튼/문 변화 (보낸 사람에게는 돌려주지 않음) |
| | `room:host` | 방장이 나가면 가장 오래 기다린 사람이 방장이 됨 |
| | `room:cleared {room,byNickname}` | 누군가 탈출구에 도달해 방 전체가 클리어됨 (걸린 시간 = `clearedAt - startedAt`) |
| | `room:started` / `room:closed` / `room:replaced` | 게임 시작 / 방장이 방을 닫음 / 같은 사람이 다른 창에서 접속해 이 연결이 교체됨 |

- 위치 동기화는 **클라이언트가 보내고 서버는 중계만 한다.** 서버는 값이 숫자인지, 좌표가 ±100 안인지, 초당 40회를 넘지 않는지만 확인한다(대기실에는 퍼즐이 없어 서버 물리가 필요 없다). 받는 쪽은 도착한 위치로 부드럽게 이동하며 보간한다.
- 서버는 각 방의 마지막 위치를 메모리에 두어서, 늦게 들어온 사람도 이미 있는 사람이 어디 있는지 바로 본다.
- **맵 플레이**: 방은 만들 때 맵의 **배포본(release) id를 고정**해 두므로, 작성자가 다시 배포해도 진행 중인 방은 바뀌지 않는다. 방장이 시작하면(`room:started`) 모두가 같은 소켓 연결을 유지한 채 대기실 장면을 버리고 고정된 레이아웃으로 맵 장면을 새로 만든다(새로고침해도 `status: playing`이면 바로 맵으로 들어간다). 문·버튼·메모 규칙은 `engine/`에 있어서 에디터 플레이 테스트와 같은 코드이고, 화면(메모/선택지/비밀번호/조사 대상 고르기)만 React 오버레이(`GameInteractionUi.jsx`)다. 버튼 누름과 문 해제는 `play:action`으로 서버에 보내고 모두의 화면에 반영된다. 비밀번호는 클라이언트가 레이아웃에서 검사한다(현재는 신뢰 모델).
- **클리어**: 맵의 탈출구(방 연결 탭이나 오브젝트 탭의 `탈출구 추가`로 벽에 만든다)가 열려 있을 때 그 앞에 서면 클라이언트가 `room:clear`를 보내고, 서버가 방을 `cleared`로 바꿔 모두에게 엔딩 화면(걸린 시간, `방 목록으로`)을 띄운다. 한 명이 도달하면 전원 클리어다.
- **방 단위 가시성**: 맵의 모든 방이 같은 원점에 그려지므로, 다른 방에 있는 사람은 보이지 않는다(위치와 함께 보내는 `room` 값이 내 현재 방과 같을 때만 표시, 방을 옮기면 그 자리로 바로 이동).
- 한 사람이 한 방에서 연결을 하나만 가진다(새로고침, 두 번째 탭은 이전 연결을 대체).

## 프론트엔드 동작 방식

React가 화면 전환과 그 안의 2D UI를 담당한다. `Editor.jsx`는 `<canvas>` 하나를 만들고 `createScene(canvas, mapId)`를 호출하는 것으로 끝나고, 3D 씬 조작·오브젝트 배치·저장/복원 같은 실질적인 로직은 `src/editor/`의 바닐라 JS 모듈이 처리한다(캐릭터 이동, 드래그 재부모화, 커스텀 충돌처럼 씬을 명령형으로 직접 조작하는 코드가 압도적으로 많아서 react-three-fiber를 쓰지 않는다).

### engine / editor / game 의 관계

```text
engine/  — 방을 그리고 캐릭터를 움직이는 공용 부품. 에디터 화면 요소(DOM)를 모른다.
   ▲                         ▲
editor/  — engine + 편집 도구    game/  — engine + (곧) 네트워크, 게임 화면
```

플레이 테스트, 대기실, 게임 플레이는 모두 "방 안에서 캐릭터가 돌아다니는 장면"이 필요해서, 그 부분을 한 번만 만들어 `engine/`에 두고 에디터와 게임이 같이 쓴다. 그래서 편집 중 플레이 테스트에서 되던 이동·충돌이 실제 플레이에서도 똑같이 동작한다.

각 모듈은 `initXxx(ctx)` 형태로 `createScene()` / `createGameScene()`이 호출될 때마다 새로 만드는 객체 `ctx`에 함수와 상태를 얹는다. 맵을 바꿔 다시 만들어도 이전 상태가 남지 않는다. **전역 이벤트 리스너·렌더 루프·타이머는 `ctx.listen` / `ctx.addDisposer`로 등록**하고, 화면을 나갈 때 `ctx.dispose()`가 렌더 루프, 리스너, 두 개의 WebGL 컨텍스트(에디터는 메인 + 썸네일)를 모두 해제한다. 브라우저는 WebGL 컨텍스트 수에 상한이 있어서, 정리하지 않으면 방을 몇 번 드나드는 것만으로 화면이 멈춘다.

아직 `editor/core/play-interactions.js`에 남아 있는 것(메모·선택지·비밀번호 모달, 문 열림 규칙과 전환)은 게임 규칙이라 맵 플레이를 만들 때 `engine/`으로 옮긴다. 대기실에는 필요 없어서 이번에는 옮기지 않았다.

### 자동 검증용 접점
`localStorage`에 `et-debug`를 설정하면 에디터와 게임 장면이 `window.__et`로 장면 객체(`ctx`)를 노출한다. 자동화된 브라우저가 캐릭터 위치·현재 방 같은 실제 상태를 읽어서 이동, 충돌, 문 통과, 화면을 나갈 때의 정리를 검증하는 데 쓴다(화면 비교는 타이밍 때문에 흔들려서 쓰지 않는다).

### 에디터 저장

- 편집 때마다 `ctx.saveLayout()`이 호출되지만 바로 전송하지 않는다. **첫 변경 후 10초 안에 한 번**(그 사이 변경이 더 생겨도 타이머를 리셋하지 않음) 맵 전체를 `PUT`한다. 자동 저장은 화면에 아무것도 띄우지 않고, 실패하면 하단에 오류를 표시하고 5초 뒤 재시도한다.
- **Ctrl+S**(Mac은 Cmd+S)는 즉시 저장하고 "저장됨"을 2초간 보여 준다. 에디터를 나가거나 페이지를 닫을 때도 즉시 저장을 시도한다.
- 마지막으로 저장된 JSON과 같으면 요청을 건너뛴다.
- 맵을 불러오기 전(또는 실패했을 때)에는 저장을 막는다. 서버 저장이 "통째 교체"라서, 불러오기가 실패한 채 자동 저장이 돌면 실제 데이터를 빈 맵으로 덮어쓰기 때문이다. 방 오브젝트를 아직 불러오는 중일 때도 저장을 미룬다.

## 서버와 배포

```text
인터넷 → nginx :443
          ├─ /                정적 파일 (/var/www/escapetheroom)
          ├─ /api/            → 127.0.0.1:3100 (백엔드 컨테이너, /api 경로 그대로 전달)
          └─ /socket.io/      → 127.0.0.1:3100
```

프론트엔드는 `npm run build`로 만든 `dist/`를 `/var/www/escapetheroom`에 복사해서 배포한다. 백엔드·DB·Redis는 `docker compose`로 올린다.

## 개발과 배포 명령

프론트엔드:

```bash
cd ~/app/escapetheroom
npm ci
npm run build
sudo rm -rf /var/www/escapetheroom/*
sudo cp -r dist/* /var/www/escapetheroom/
```

백엔드(코드를 바꾼 뒤 이미지를 다시 빌드해서 재시작):

```bash
docker compose up -d --build backend
```

스키마 변경은 `db/schema.sql`을 고친 뒤, 데이터가 있는 DB에는 `ALTER TABLE` 같은 변경 쿼리를 직접 실행한다. `db/schema.sql` 전체를 다시 실행하면 모든 테이블이 비워지므로 보존할 데이터가 없을 때만 쓴다.

nginx 설정을 바꾼 경우에만:

```bash
sudo nginx -t && sudo systemctl reload nginx
```
