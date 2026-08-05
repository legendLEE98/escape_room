# Three.js 오징어 캐릭터 테스트 작업 정리

## 1. 현재 구현 범위

Three.js에서 GLB 동물 에셋을 불러오고, 오징어 메시만 화면에 표시하는 로컬 테스트 프로젝트를 구성했다.

현재 구현된 기능은 다음과 같다.

- Vite 기반 로컬 개발 서버
- Three.js WebGL 렌더링
- GLB 모델 로드
- 오징어 메시 자동 탐색
- 오징어 샘플 선택
- 고정 쿼터뷰 카메라
- 캐릭터를 따라가는 카메라
- 바닥 클릭 이동
- WASD 8방향 이동
- 이동 방향에 따른 부드러운 캐릭터 회전
- 클릭 목적지 표시
- 조명, 그림자, 바닥 및 격자 표시
- 키보드 이동 시 바닥 영역 이탈 방지

현재는 **오징어 동작 샘플 1**을 기준 캐릭터로 사용한다.

---

## 2. 프로젝트 경로

```text
C:\Users\User\OneDrive\바탕 화면\escape
```

주요 파일 구조는 다음과 같다.

```text
escape/
├─ index.html
├─ package.json
├─ package-lock.json
├─ src/
│  ├─ main.js
│  └─ style.css
└─ public/
   └─ models/
      └─ quirky_series_-_free_animals_pack.glb
```

### 파일 역할

- `package.json`
  - Vite 실행 명령과 Three.js 의존성을 관리한다.
- `index.html`
  - 웹 페이지 진입점과 테스트 UI를 정의한다.
- `src/main.js`
  - Three.js 장면, 모델, 카메라, 입력 및 이동 로직을 담당한다.
- `src/style.css`
  - 화면과 좌측 안내 패널의 스타일을 담당한다.
- `public/models/*.glb`
  - 브라우저에서 불러오는 3D 모델 파일이다.

---

## 3. 실행 방법

PowerShell에서 다음 명령을 실행한다.

```powershell
cd "C:\Users\User\OneDrive\바탕 화면\escape"
npm run dev
```

기본 접속 주소:

```text
http://localhost:5173
```

포트를 명시하려면 다음 명령을 사용한다.

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

개발 서버는 파일을 수정하면 변경 사항을 자동으로 반영한다. 반영되지 않으면 브라우저를 새로고침한다.

배포용 빌드 확인:

```powershell
npm run build
```

---

## 4. GLB 모델 분석 결과

사용 중인 파일:

```text
quirky_series_-_free_animals_pack.glb
```

이 파일은 게임용 단일 캐릭터 에셋이 아니라 여러 동물과 동작을 한 장면에 배치한 쇼케이스 성격의 에셋이다.

확인된 특징:

- 여러 종류의 동물이 하나의 GLB에 포함되어 있다.
- 오징어 재질 이름은 `M_Inkfish`이다.
- 오징어 메시가 총 5개 감지된다.
- 각 오징어 샘플의 기본 방향이 서로 다를 수 있다.
- 애니메이션은 `Idle`, `Walk`, `Attack`처럼 분리되어 있지 않다.
- 전체 장면 애니메이션이 `Scene`이라는 하나의 클립으로 묶여 있다.
- 전시용 글자와 배치 정보도 파일에 포함되어 있다.

현재 코드는 메시의 재질 이름이 `M_Inkfish`인지 검사하여 오징어만 표시한다.

```js
const isSquid = materials.some(
  (material) => material?.name === 'M_Inkfish',
);
```

현재 방향과 움직임이 가장 자연스러운 **오징어 동작 샘플 1**을 기준으로 사용한다.

---

## 5. 장면과 카메라

### 카메라

쿼터뷰 표현을 위해 `OrthographicCamera`를 사용한다.

```js
const camera = new THREE.OrthographicCamera();
const cameraOffset = new THREE.Vector3(8, 10, 8);
```

카메라는 캐릭터의 대각선 위쪽에 위치하며 캐릭터 이동을 부드럽게 따라간다.

```js
cameraTarget.copy(character.position).add(cameraOffset);
camera.position.lerp(cameraTarget, cameraLerp);
camera.lookAt(
  character.position.x,
  character.position.y + 0.65,
  character.position.z,
);
```

창 크기가 변경되면 화면 비율에 맞춰 직교 카메라의 좌우 범위를 다시 계산한다.

### 조명

현재 다음 조명을 사용한다.

- `HemisphereLight`
  - 장면 전체의 기본 조명
- 첫 번째 `DirectionalLight`
  - 주광과 그림자
- 두 번째 `DirectionalLight`
  - 캐릭터 테두리를 살리는 보조광

### 바닥

- 원형 바닥 반지름: `18`
- 이동 가능한 최대 거리: 중심에서 `17.5`
- 클릭 위치 확인을 위한 원형 마커 사용
- 방향과 거리를 확인하기 위한 격자 사용

---

## 6. 클릭 이동

바닥을 클릭하면 Raycaster가 마우스 위치와 바닥의 교차점을 찾는다.

```js
raycaster.setFromCamera(pointer, camera);
const hit = raycaster.intersectObject(floor, false)[0];
```

교차점이 있으면 다음 값을 갱신한다.

- 이동 목적지
- 목적지 마커 위치
- 이동 상태

캐릭터는 매 프레임 목적지까지 남은 거리를 계산하고 일정한 속도로 이동한다.

목적지와의 거리가 `0.04`보다 작으면 도착한 것으로 처리한다.

---

## 7. WASD 8방향 이동

지원 키:

| 키 | 이동 방향 |
|---|---|
| `W` | 화면 위 |
| `S` | 화면 아래 |
| `A` | 화면 왼쪽 |
| `D` | 화면 오른쪽 |

두 키를 동시에 누르면 대각선으로 이동한다.

예:

- `W + A`: 왼쪽 위
- `W + D`: 오른쪽 위
- `S + A`: 왼쪽 아래
- `S + D`: 오른쪽 아래

이동 벡터를 정규화하므로 대각선 이동 속도가 직선 이동보다 빨라지지 않는다.

WASD 방향은 고정된 월드 좌표가 아니라 현재 카메라가 보는 화면 방향을 기준으로 계산한다.

```js
camera.getWorldDirection(cameraForward);
cameraForward.y = 0;
cameraForward.normalize();
cameraRight.crossVectors(cameraForward, camera.up).normalize();
```

키보드 입력이 시작되면 기존 클릭 목적지는 취소된다.

---

## 8. 이동 속도와 회전

현재 이동 속도:

```js
let characterSpeed = 2.8;
```

캐릭터는 이동 방향으로 즉시 회전하지 않고 부드럽게 회전한다.

```js
const rotationDifference = Math.atan2(
  Math.sin(targetRotation - character.rotation.y),
  Math.cos(targetRotation - character.rotation.y),
);

character.rotation.y +=
  rotationDifference * Math.min(1, delta * 10);
```

`delta * 10`의 숫자를 조절하면 회전 반응 속도를 변경할 수 있다.

- 숫자를 높이면 빠르게 회전한다.
- 숫자를 낮추면 천천히 회전한다.

---

## 9. 오징어 방향 보정

오징어 동작 샘플 1은 이동 방향보다 약간 왼쪽을 바라보는 현상이 있었다.

테스트 결과 화면 기준 오른쪽으로 총 17도 보정한 상태가 가장 자연스러웠다.

현재 보정값:

```js
const modelHeadingCorrection = THREE.MathUtils.degToRad(-17);
```

목표 회전값 계산:

```js
const targetRotation =
  Math.atan2(movementDirection.x, movementDirection.z) +
  modelHeadingCorrection;
```

주의:

- 이 보정값은 오징어 동작 샘플 1을 기준으로 한다.
- 다른 오징어 샘플은 자체 기본 방향이 다르므로 동일한 보정값이 맞지 않을 수 있다.
- 현재는 샘플 1을 사용하고 다른 샘플의 방향 차이는 보류한다.

---

## 10. 현재 입력 우선순위

1. 바닥 클릭 시 클릭 목적지를 향해 이동한다.
2. 이동 도중 WASD를 누르면 클릭 이동을 취소한다.
3. WASD를 누르는 동안 키보드 방향으로 이동한다.
4. 키를 모두 놓으면 현재 위치에서 멈춘다.

브라우저가 포커스를 잃으면 눌린 키 상태를 모두 초기화한다. 따라서 창 전환 후 캐릭터가 계속 이동하는 현상을 방지한다.

---

## 11. 알려진 한계

### 샘플마다 방향이 다름

오징어 샘플마다 모델의 기본 회전값이 다르게 저장되어 있다. 현재 17도 보정은 샘플 1에만 적합하다.

### 애니메이션이 분리되어 있지 않음

현재 GLB에는 다음과 같은 독립적인 애니메이션 클립이 없다.

```text
Idle
Move
Attack
```

대신 전체 쇼케이스가 `Scene` 클립 하나로 합쳐져 있다. 따라서 현재 단계에서는 이동 여부에 따라 걷기와 대기 애니메이션을 자연스럽게 전환하기 어렵다.

### 불필요한 데이터가 많음

다른 동물, 전시용 글자, 여러 오징어 샘플이 한 파일에 포함되어 있다. 실제 게임 배포용 캐릭터 파일로는 비효율적이다.

### 충돌과 길 찾기가 없음

현재 이동 가능한 공간은 원형 바닥뿐이다.

- 벽 충돌 없음
- 장애물 충돌 없음
- 길 찾기 없음
- 방과 문 구조 없음

---

## 12. 향후 Blender 정리 권장 사항

실제 게임 제작 단계에서는 Blender에서 GLB를 정리하는 것이 좋다.

권장 구조:

```text
SquidRoot
├─ Armature
└─ SquidMesh

Animations
├─ Idle
├─ Move
└─ Attack
```

정리할 항목:

1. 사용할 오징어 모델과 Armature 하나만 남긴다.
2. 다른 동물과 전시용 글자를 삭제한다.
3. 캐릭터 원점을 `(0, 0, 0)`으로 맞춘다.
4. 캐릭터 하단을 바닥 높이와 맞춘다.
5. 정면 축을 Three.js 기준에 맞게 통일한다.
6. 루트 위치가 움직이지 않는 제자리 애니메이션으로 만든다.
7. 필요한 동작을 각각 별도의 Action으로 분리한다.
8. GLB로 다시 내보낸다.

정면 축을 올바르게 정리하면 코드에 있는 `modelHeadingCorrection`을 제거할 수 있다.

---

## 13. 다음 작업 후보

현재 캐릭터 이동 테스트 다음으로 진행할 수 있는 작업:

1. 샘플 선택 UI 제거 후 샘플 1 고정
2. 사각형 테스트 방 제작
3. 벽과 장애물 충돌 구현
4. 클릭 이동용 간단한 길 찾기 적용
5. 문 상호작용 구현
6. 1인칭과 쿼터뷰 전환
7. Blender에서 오징어 단일 모델과 애니메이션 정리
8. 이동 상태에 따른 `Idle` / `Move` 전환
9. 멀티플레이 위치 및 회전 동기화

현재 단계에서는 **샘플 1, 쿼터뷰, 클릭 이동, WASD 이동**을 기준 상태로 유지한다.
