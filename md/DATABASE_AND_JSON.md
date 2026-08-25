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
- `position` / `rotation` / `scale`은 Three.js의 `Vector3.toArray()` / `Euler.toArray()`와 바로 맞도록 `[x, y, z]` 배열로 저장한다. `{x, y, z}` 객체 형태는 쓰지 않는다.
- `blocksMovement`가 `true`(기본값)인 오브젝트는 로드 시 `Box3`로 충돌 영역을 자동 계산해서 캐릭터 이동을 막는다. 벽에 붙은 액자나 시계처럼 캐릭터가 닿을 일이 없는 오브젝트는 `false`로 꺼서 불필요한 충돌 계산을 뺀다. 자동 계산된 박스가 안 맞는 특수한 경우(예: L자형 소파)에 한해서만 나중에 `collider` 같은 override 필드를 추가로 검토한다 — 처음부터 넣지 않는다.
- `interaction`은 상호작용이 없는 오브젝트가 대부분이라 기본값을 `null`로 둔다. 있을 때만 아래처럼 채운다.

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
