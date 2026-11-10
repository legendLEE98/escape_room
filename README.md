# Escape the Room

3D 공간에서 직접 맵을 만들고, 공유 코드로 배포해서 친구들과 함께 탈출하는 온라인 웹 방탈출 게임.

## 주요 기능

- **맵 에디터** — GLB 에셋 배치, 방 그리기(격자), 벽 자동 생성, 방 사이 문 연결, 문 잠금(버튼·비밀번호), 메모·선택지·이미지·버튼 상호작용, 플레이 테스트
- **맵 배포** — 작업본과 변경 불가능한 배포본을 분리하고, 8자리 공유 코드로 누구나(비로그인 포함) 맵을 불러온다
- **멀티플레이** — 방 목록·검색·생성, 대기실 캐릭터 위치 실시간 동기화(socket.io), 방장 시작
- **플레이** — WASD·클릭(A*) 이동, 충돌, 조사(`G`)로 상호작용, 문 해금 상태를 방 전체가 공유
- **기본 제공 맵** — 튜토리얼 등 공식 맵을 방 만들기 화면에 항상 노출
- **계정** — 이메일 회원가입/로그인(JWT httpOnly 쿠키, argon2id). 맵 제작만 로그인이 필요하고 플레이는 게스트도 가능

## 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 프론트엔드 | React 19, Vite, Three.js (바닐라) |
| 백엔드 | NestJS 11, TypeORM, socket.io |
| 데이터 | PostgreSQL 16, Redis 7 |
| 인프라 | Docker Compose, nginx (HTTPS, 정적 파일, `/api`·`/socket.io` 프록시) |

## 폴더 구조

```text
src/            프론트엔드
  screens/      화면(랜딩, 방 목록, 방 만들기, 게임방, 맵 목록, 에디터)
  data/         서버 호출
  engine/       에디터와 게임이 함께 쓰는 3D 부품(이동, 충돌, 문, 상호작용)
  game/         게임 클라이언트
  editor/       맵 에디터(바닐라 Three.js)
backend/        NestJS 백엔드(auth, maps, game-rooms, uploads)
db/schema.sql   DB 스키마
scripts/        에셋 인덱스 생성
md/             상세 문서
compose.yaml    postgres + redis + backend
```

## 실행 방법

### 1. 환경 변수

프로젝트 루트에 `.env`를 만든다. (커밋하지 않는다)

```env
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
JWT_SECRET=...
# 선택: POSTGRES_DB, POSTGRES_USER (기본값 escapetheroom)
```

### 2. 백엔드, DB, Redis

```bash
docker compose up -d --build
```

처음에는 DB가 비어 있으므로 `db/schema.sql`을 한 번 적용한다.
**이 파일은 모든 테이블을 지우고 다시 만드니, 데이터가 있는 DB에는 실행하지 않는다.**
컬럼 추가 같은 변경은 `ALTER TABLE`로 직접 적용한다(TypeORM `synchronize`는 꺼져 있다).

### 3. 프론트엔드

```bash
npm install
npm run dev      # 개발 서버. /api, /socket.io는 127.0.0.1:3100 백엔드로 프록시
npm run build    # dist/ 생성
```

`dev`와 `build` 전에 에셋 인덱스(`public/models/assets/asset-index.json`)가 자동 생성된다.

### 에셋(GLB) 안내

`public/models/*`는 `.gitignore`에 들어 있어 저장소에 없다. 에셋을 직접 `public/models/assets/<카테고리>/`에 넣어야 에디터에서 쓸 수 있다.

## 배포

```bash
npm run build
rm -rf /var/www/escapetheroom/* && cp -r dist/* /var/www/escapetheroom/
docker compose up -d --build backend   # 백엔드를 고쳤을 때
sudo systemctl reload nginx            # nginx 설정을 바꿨을 때
```

- 업로드한 이미지는 Docker 볼륨 `uploads-data`에 저장된다.
- 포트는 호스트에서 `127.0.0.1`로만 열려 있다(Postgres 5433, Redis 6380, 백엔드 3100).

## 조작 방법 (플레이)

| 키 | 동작 |
| --- | --- |
| `W` `A` `S` `D` | 이동 |
| 마우스 클릭 | 클릭한 곳으로 이동 |
| `G` | 가까운 물건·문 조사 |
| 휠 | 화면 확대·축소 |
| `Esc` | 창 닫기 |

## 문서

더 자세한 내용은 [md/README.md](md/README.md)에서 시작한다.

- [게임 플레이](md/GAMEPLAY.md)
- [아키텍처](md/ARCHITECTURE.md)
- [DB와 JSON 구조](md/DATABASE_AND_JSON.md)
- [맵 배포](md/MAP_DEPLOY.md)
