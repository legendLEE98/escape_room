# DB와 JSON 구조

## 이 문서를 볼 때

맵 저장 기능, 에디터, API, 데이터베이스 테이블을 작업할 때 본다. 게임 안에서 이 데이터가 어떻게 쓰이는지는 [게임 플레이](./GAMEPLAY.md), 전체 서버 구성은 [아키텍처](./ARCHITECTURE.md)를 참고한다.

## 현재 테이블

### map_info

맵 목록에서 보여 줄 기본 정보다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid | 맵 ID |
| title | varchar | 맵 이름 |
| filter | varchar | 맵 분류 |
| difficulty | smallint | 난이도 |
| map_desc | text | 맵 설명 |
| min_user / max_user | smallint | 최소·최대 인원 |
| deploy | boolean | 배포 여부 |
| created_at / updated_at | timestamptz | 만든·수정한 시각 |

### map_room

맵 안의 방 정보다. `map_id`는 `map_info.id`를 가리킨다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid | 방 ID |
| map_id | uuid | 소속 맵 ID |
| room_name | varchar | 방 이름 |
| connected_rooms | jsonb | 이동할 수 있는 방 목록 |
| initial_spawn_pos | jsonb | 처음 들어올 위치 |
| is_start_room | boolean | 시작 방 여부 |

### map_object

방 안에 배치한 3D 오브젝트다. `room_id`는 `map_room.id`를 가리킨다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid | 오브젝트 ID |
| room_id | uuid | 소속 방 ID |
| name | varchar | 에디터에서 보여 줄 이름 |
| glb_url | varchar | GLB 파일 주소 |
| position / rotation / scale | jsonb | 위치, 회전, 크기 |
| cast_shadow / receive_shadow | boolean | 그림자 설정 |
| blocks_movement | boolean | 캐릭터 충돌 처리 여부 (기본 true) |

### map_interaction

오브젝트를 클릭했을 때 열 2D 모달 정보를 저장한다. `object_id`는 `map_object.id`를 가리킨다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid | 상호작용 ID |
| object_id | uuid | 대상 오브젝트 ID |
| interaction_type | varchar | 상호작용 종류 |
| bg_image_url | varchar | 모달에 표시할 2D 배경 이미지 |
| click_regions | jsonb | 이미지 위의 클릭 영역 |
| required_item_id | uuid | 필요한 아이템 ID |
| reward_item_id | uuid | 성공 시 주는 아이템 ID |

## 맵 에디터용 JSON 구조

맵 저장 API와 게임방이 생기기 전까지는, 방을 만들고 3D에서 바로 테스트해 볼 수 있도록 아래 형태의 JSON 파일 하나로 맵을 정의한다. DB 저장은 이 구조를 `map_room` / `map_object` / `map_interaction` 테이블로 그대로 풀어서 넣는 방식으로 처리한다.

```json
{
  "rooms": [
    {
      "id": "room-office-1",
      "roomName": "사무실",
      "isStartRoom": true,
      "initialSpawnPos": [0, 0, 0],
      "connectedRooms": [
        { "roomId": "room-office-2", "doorObjectId": "obj-door-1" }
      ],
      "objects": [
        {
          "id": "obj-desk-1",
          "name": "책상",
          "glbUrl": "/models/assets/curated__office-desk-10.glb",
          "transform": {
            "position": [1.5, 0, -3.2],
            "rotation": [0, 0, 0],
            "scale": [1, 1, 1]
          },
          "castShadow": true,
          "receiveShadow": true,
          "blocksMovement": true,
          "colliderShape": "box",
          "interaction": null
        },
        {
          "id": "obj-door-1",
          "name": "복도로 가는 문",
          "glbUrl": "/models/assets/michael-room__door_group.glb",
          "transform": {
            "position": [0, 0, -5],
            "rotation": [0, 0, 0],
            "scale": [1, 1, 1]
          },
          "castShadow": true,
          "receiveShadow": true,
          "blocksMovement": false,
          "colliderShape": "box",
          "interaction": null
        }
      ]
    },
    {
      "id": "room-office-2",
      "roomName": "복도",
      "isStartRoom": false,
      "initialSpawnPos": [0, 0, -8],
      "connectedRooms": [
        { "roomId": "room-office-1", "doorObjectId": "obj-door-1-back" },
        { "roomId": "room-office-3", "doorObjectId": "obj-door-2" }
      ],
      "objects": [
        {
          "id": "obj-door-1-back",
          "name": "사무실로 가는 문",
          "glbUrl": "/models/assets/michael-room__door_group.glb",
          "transform": {
            "position": [0, 0, -6],
            "rotation": [0, 0, 0],
            "scale": [1, 1, 1]
          },
          "castShadow": true,
          "receiveShadow": true,
          "blocksMovement": false,
          "colliderShape": "box",
          "interaction": null
        },
        {
          "id": "obj-door-2",
          "name": "회의실로 가는 문",
          "glbUrl": "/models/assets/michael-room__door_group.glb",
          "transform": {
            "position": [4, 0, -8],
            "rotation": [0, 1.5708, 0],
            "scale": [1, 1, 1]
          },
          "castShadow": true,
          "receiveShadow": true,
          "blocksMovement": false,
          "colliderShape": "box",
          "interaction": null
        }
      ]
    }
  ]
}
```

- 방 하나가 여러 방과 연결될 수 있으므로 `connectedRooms`는 배열이다. 위 예시에서 `room-office-2`(복도)는 `room-office-1`(사무실), `room-office-3`(회의실, 지면상 본문은 생략) 양쪽으로 통하는 문이 있어서 `connectedRooms` 배열에 항목이 두 개다.
- `connectedRooms`의 각 항목은 "이 방에서 `doorObjectId` 문을 통과하면 `roomId` 방으로 이동한다"는 뜻이다. 문 오브젝트는 그 문이 속한 방의 `objects` 목록 안에 실물로 있어야 한다. 그래서 사무실↔복도를 잇는 문도 양쪽에 각각 별도 오브젝트로 존재한다 — `room-office-1`의 `obj-door-1`과 `room-office-2`의 `obj-door-1-back`은 같은 문을 양쪽에서 표현한 것이다.
- `id`는 방과 오브젝트를 만드는 시점에 바로 부여한다 (예: `crypto.randomUUID()`). `connectedRooms`의 `doorObjectId`처럼 서로를 참조해야 해서, 저장 시점이 아니라 배치 시점부터 고정된 값이 있어야 한다.
- 방 레벨의 `connectedRooms`는 별도로 입력하는 값이 아니라, **각 문 오브젝트의 `interaction.connectedRoomId`에서 저장 시점에 자동으로 만들어진다.** 에디터에서는 문 오브젝트를 선택해서 "상호작용 종류"를 `door`로 지정하고 "연결할 방"만 고르면 된다.
- **실제 배포된 게임에서는 순간이동이 아니다.** 맵을 개시(배포)하는 시점에 `connectedRooms` 그래프를 보고 방들을 실제 월드 좌표에 서로 안 겹치게 재배치하는 계산이 들어갈 예정이고(아직 미구현), 그 결과로 방끼리 물리적으로 분리된 공간이 아니라 하나의 연속된 3D 씬 안에 다 같이 배치된다. 문은 그냥 `blocksMovement: true`인 오브젝트라, 플레이어가 문을 클릭하면(지금은 열쇠 조건 없이 바로) `blocksMovement`가 `false`로 바뀌면서 걸어서 통과할 수 있게 된다. `connectedRoomId`는 실제 이동 로직이 아니라 "이 문이 어느 방으로 이어지는지" 기록해두는 메타데이터다(미니맵, 진행도 추적, 위 재배치 계산의 입력값 등에 활용).
- **에디터에서는 아직 이렇게 동작하지 않는다.** 지금 에디터는 방을 하나씩 격리해서 편집/테스트하도록 설계돼 있다 — 한 번에 한 방의 루트 그룹만 화면에 보이고(`ctx.applyRoomVisibility`), 나머지 방은 좌표가 겹쳐도 안 보이게 숨겨둔다(각 방은 편집 중엔 전부 같은 원점 근처에 그려진다). 그래서 "움직임 테스트" 모드에서도 문을 통과해 실제로 다른 방까지 걸어가는 건 아직 확인할 수 없고, 현재 선택된 방 하나 안에서의 이동/충돌만 테스트된다. 위에서 설명한 "연속된 하나의 씬" 동작은 맵을 실제로 배포했을 때를 기준으로 한 설명이다.
- `position` / `rotation` / `scale`은 Three.js의 `Vector3.toArray()` / `Euler.toArray()`와 바로 맞도록 `[x, y, z]` 배열로 저장한다. `{x, y, z}` 객체 형태는 쓰지 않는다.
- `blocksMovement`가 `true`(기본값)인 오브젝트는 로드 시 `Box3`로 충돌 영역을 자동 계산해서 캐릭터 이동을 막는다. 벽에 붙은 액자나 시계처럼 캐릭터가 닿을 일이 없는 오브젝트는 `false`로 꺼서 불필요한 충돌 계산을 뺀다.
- `colliderShape`는 `box`(기본값) 또는 `cylinder`다. 사각형 가구는 `box`(오브젝트 바운딩 박스로 XZ 평면 사각형 판정), 기둥·원형 오브젝트는 `cylinder`(바운딩 박스에서 반지름을 뽑아 원-원 판정)로 지정한다. `box`로 원형 오브젝트를 감싸면 실제로는 안 닿았는데 모서리 부분에서 막히는 "가짜 충돌"이 생기기 때문에 나눴다. 충돌/밀기 관련 세부 규칙은 [게임 플레이](./GAMEPLAY.md)의 "이동과 충돌" 절을 참고한다.
- `interaction`은 상호작용이 없는 오브젝트가 대부분이라 기본값을 `null`로 둔다. 있을 때만 아래처럼 채운다.
- `glbUrl`이 `null`이면 GLB 없이 껍데기만 있는 "빈 오브젝트"다(유니티의 빈 GameObject와 동일한 개념). 다른 오브젝트를 묶어서 폴더처럼 관리하거나(`parentObjectId`로 자식들을 붙임), 좌표 기준점으로만 쓸 때 사용한다. 렌더링되는 geometry가 없어서 `blocksMovement`는 기본값이 `false`다.
- `parentObjectId`는 이 오브젝트가 다른 오브젝트에 소속돼서 같이 움직이는지를 나타낸다. 기본값은 `null`(부모 없음, 방에 직접 배치)이고, 값이 있으면 다른 오브젝트의 `id`를 가리킨다(같은 방일 필요는 없다). 예: 서랍 손잡이가 서랍장에 속해 있으면 손잡이 오브젝트의 `parentObjectId`가 서랍장 오브젝트의 `id`가 된다. `position`/`rotation`/`scale`은 부모 오브젝트 기준 로컬 좌표로 저장되므로(에디터에서 부모 이동 시 자식이 같이 따라 움직인다), 복원할 때도 부모를 먼저 만든 뒤 자식을 그 아래에 붙여야 한다. 에디터에서는 하이라키 목록에서 오브젝트를 다른 오브젝트의 가운데로 드래그하면 그 오브젝트의 자식이 되고, 위쪽/아래쪽 가장자리로 드래그하면 그 오브젝트의 형제로서 순서만 바뀐다(원래 자리에서 배열에서 빠져서 대상 앞/뒤로 다시 꽂히는 식이라, 그 사이에 있던 다른 오브젝트들은 자동으로 한 칸씩 밀린다). 하이라키 목록 맨 위 툴바(방 드롭다운이 있는 곳) 위로 드래그하면 부모 관계가 풀리고 현재 방의 최상위로 올라간다.
- `visible`(기본값 `true`)은 에디터 하이라키 목록의 눈 아이콘으로 껐다 켰다 하는 값으로, 그 오브젝트와 하위 오브젝트 전부를 씬에서 보이지 않게 한다. 순수 편집 편의 기능이라 `blocksMovement` 등 충돌 로직에는 영향을 주지 않는다(꺼놔도 여전히 이동을 막을 수 있다). 다시 페이지를 열었을 때도 유지되도록 저장 데이터에 포함한다.
- 하이라키 목록에서 오브젝트의 자식들을 접었는지 여부(`ctx.collapsedInstanceIds`)는 저장하지 않는다 — 그 정도까지 보존할 가치는 없는 순수 세션 중 UI 상태라, 새로고침하면 항상 펼쳐진 상태로 시작한다.
- `isSpawnPoint`(기본값 `false`)가 `true`인 오브젝트는 그 방의 캐릭터 스폰 위치/방향을 나타내는 마커다. 방마다 하나만 있을 수 있고(하이라키 우클릭 메뉴의 "스폰 위치 추가"가 이미 있으면 새로 안 만들고 기존 것을 선택한다), `glbUrl`은 항상 `null`이며 초록색 화살표 모양의 마커 도형(위치 표시 콘 + 바라보는 방향 표시 콘)으로 렌더링된다 — `position`/`rotation.y`가 실제 캐릭터의 스폰 위치·바라보는 방향이 된다. 이 마커는 에디터 모드에서만 보이고 움직임 테스트/실제 플레이에서는 자동으로 숨겨진다(`blocksMovement`도 항상 `false`). 방 레벨의 `initialSpawnPos`는 이 마커의 `position`에서 저장 시점에 자동으로 계산된다(직접 입력하는 값이 아니다). 이 마커가 없는 방은 기존처럼 맵 중앙 근처의 빈 공간을 자동으로 찾아 스폰한다.
- `floorCells`는 방의 바닥을 구성하는 1x1 격자 칸 목록이다: `[{ "x": 0, "z": 0 }, { "x": 1, "z": 0 }, ...]` 형태이고(칸 `{x,z}`는 그 칸의 최소 모서리 좌표 — 실제 칸은 `[x, x+1] x [z, z+1]` 사각형), 값이 없으면(구버전 데이터 등) `null`이다. 사각형 한 개가 아니라 **임의의 모양(L자 등)을 구성할 수 있는 칸 집합**이다. 에디터에서 이 도구로 들어가는 진입점은 두 개인데 동작이 다르다 — 하이라키의 "+ 방"(또는 우클릭 메뉴의 "방 추가")은 **새 방을 만드는** 진입점이고, 상단 탭의 "방 수정"은 **현재 선택된 방의 기존 칸 구성을 불러와서 이어서 편집하는** 진입점이다(완료를 누르면 새 방이 아니라 그 방 자체가 갱신됨). 둘 다 탑뷰로 전환되고, 칸을 켜고 끄는 방식은 두 가지다 — **클릭**은 칸 하나만 토글(다시 클릭하면 그 칸만 지워짐)하고, **드래그**는 시작 칸부터 끝 칸까지의 사각형 범위를 한 번에 켜거나 끈다. 드래그를 **꺼진 칸에서 시작**하면 그 범위를 전부 켜고(노란 미리보기), **이미 켜진 칸에서 시작**하면 그 범위를 전부 끈다(빨간 미리보기) — 시작한 칸의 상태로 드래그 전체의 동작(켜기/끄기)이 정해지는 방식이다. 완료를 누르면 이 값이 정해진다. 이 칸 집합이 나중에 벽 자동 생성의 기준이 될 예정이라, 지금은 칸마다 단색 바닥 메쉬만 만들지만 데이터 구조는 그대로 재사용된다.

### interaction 채워진 예시

```json
{
  "interactionType": "keypad",
  "bgImageUrl": "/images/drawer-bg.png",
  "clickRegions": [
    { "id": "keypad-button-1", "x": 120, "y": 180, "width": 48, "height": 48, "action": "input:1" }
  ],
  "requiredItemId": null,
  "rewardItemId": "item-uuid"
}
```

`clickRegions`의 `x`, `y`, `width`, `height`는 모달 배경 이미지의 원본 크기를 기준으로 저장한다. 화면 크기가 달라져도 같은 비율로 계산해서 클릭 영역을 맞춘다.

## 저장 원칙

- 맵 정보, 방, 오브젝트, 상호작용은 맵을 만드는 사람이 저장하는 원본 데이터다.
- 플레이어가 퍼즐을 풀며 바꾸는 값은 맵 원본에 저장하지 않는다.
- 아이템 획득, 열린 문, 푼 퍼즐은 나중에 게임방별 데이터로 따로 저장한다.
- 맵을 수정해서 새로 배포하면 새 UUID의 맵으로 저장한다.
