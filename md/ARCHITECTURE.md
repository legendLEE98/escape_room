# 아키텍처

## 이 문서를 볼 때

프론트엔드 파일을 고치거나, 서버·Docker·nginx 설정을 만질 때 본다. 게임 규칙은 [게임 플레이](./GAMEPLAY.md), 테이블과 맵 저장 형식은 [DB와 JSON 구조](./DATABASE_AND_JSON.md)를 참고한다.

## 현재 구성

| 구분 | 사용 기술 | 역할 |
| --- | --- | --- |
| 화면 | React + Vite | 메뉴, 패널, 모달 같은 2D 화면 |
| 3D 공간 | Three.js | 맵, 캐릭터, 카메라, 이동, 오브젝트 표시 |
| 웹 서버 | 호스트 nginx | HTTPS 처리와 정적 파일 제공 |
| 데이터베이스 | PostgreSQL Docker 컨테이너 | 맵과 오브젝트 데이터 저장 |

## 코드 위치

```text
~/app/escapetheroom
├─ src/
│  ├─ App.jsx       화면 구조와 React UI
│  ├─ main.jsx      React 시작 파일
│  ├─ scene.js      Three.js 장면, 이동, 에디터 로직
│  └─ style.css     화면 스타일
├─ public/          브라우저에서 사용할 모델과 이미지
├─ md/              프로젝트 문서
└─ compose.yaml     PostgreSQL Docker 설정
```

## 프론트엔드 동작 방식

React가 화면의 틀을 만든다. Three.js는 `canvas` 안에서 3D 장면을 그린다.

현재는 `App.jsx`가 패널과 버튼을 만들고, `scene.js`가 이동과 맵 에디터 동작을 처리한다. 앞으로 2D 상호작용 모달, 로비, 맵 목록은 React 컴포넌트로 추가한다.

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
