# DB와 JSON 구조

## 이 문서를 볼 때

맵 저장 기능, 에디터, API, 데이터베이스 테이블을 작업할 때 본다. 게임 안에서 이 데이터가 어떻게 쓰이는지는 [게임 플레이](./GAMEPLAY.md), 전체 서버 구성은 [아키텍처](./ARCHITECTURE.md)를 참고한다.

## 저장소 두 곳 — Postgres와 Redis

**맵을 만드는 사람이 저장하는 원본 데이터**(방/오브젝트/문 배치, 잠금 설정, 상호작용 내용)는 Postgres에 영구 저장한다. **플레이어가 게임방에서 진행하며 바뀌는 값**(눌린 버튼, 열린 문, 획득한 아이템, 남은 시간, 각 플레이어 현재 위치 등)은 세션 하나 한정으로 휘발성이고 쓰기 빈도가 높아서(움직일 때마다, 버튼 누를 때마다) Postgres가 아니라 Redis에 둔다. 이 구분은 [게임 플레이](./GAMEPLAY.md)의 "게임방 상태"에서 개념적으로 이미 정리했던 것을, 실제 저장소 단위로 구체화한 것이다. Postgres 테이블은 아래 "현재 테이블", Redis 키 구조는 그 아래 "Redis — 게임방 진행 상태" 절을 참고한다.

## 현재 테이블 (Postgres)

스키마 원본은 [db/schema.sql](../db/schema.sql)에 있고, 그 파일을 그대로 실행하면 아래 구조가 만들어진다(재실행하면 기존 테이블을 지우고 다시 만드므로, 보존할 데이터가 없는 개발 DB에서만 쓴다).

### map_info

맵 목록에서 보여 줄 기본 정보다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 맵 ID |
| title | varchar(100) | 맵 이름 |
| filter | varchar(50), 기본 `'DEFAULT'` | 맵 분류 |
| difficulty | smallint, 기본 1, 1~5 | 난이도 |
| map_desc | text | 맵 설명 |
| min_user | smallint, 기본 1, ≥1 | 최소 인원 |
| max_user | smallint, 기본 4, ≥min_user | 최대 인원 |
| deploy | boolean, 기본 false | 배포 여부 |
| created_at / updated_at | timestamptz, 기본 현재시각 | 만든·수정한 시각 |

### map_room

맵 안의 방 정보다. `map_id`는 `map_info.id`를 가리킨다(맵 삭제 시 방도 같이 삭제, `ON DELETE CASCADE`).

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 방 ID |
| map_id | uuid, FK → map_info | 소속 맵 ID |
| room_name | varchar(100) | 방 이름 |
| is_start_room | boolean, 기본 false | 시작 방 여부 |
| initial_spawn_pos | jsonb, 기본 `[0,0,0]` | 처음 들어올 위치. `[x,y,z]` 배열(프론트의 `Vector3.toArray()`와 그대로 대응) |
| floor_cells | jsonb, 기본 `[]` | 방 바닥을 구성하는 1x1 격자 칸 목록: `[{"x":int,"z":int}, ...]`. 벽/문 지오메트리는 저장하지 않고 이 칸 집합 + `map_door_edge`에서 클라이언트가 매번 다시 계산한다. |
| world_offset | jsonb, 기본 `{"x":0,"z":0}` | 에디터의 방 연결(문) 패널에서 이 방을 다른 방 기준으로 어디에 배치했는지 나타내는 좌표. 순수 에디터 편의 데이터로, 실제 플레이(순간이동 방식 전환)에는 쓰이지 않는다. |
| created_at | timestamptz | 만든 시각 |

### map_object

방 안에 배치한 3D 오브젝트다. `room_id`는 `map_room.id`를 가리킨다(방 삭제 시 같이 삭제).

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 오브젝트 ID |
| room_id | uuid, FK → map_room | 소속 방 ID |
| name | varchar(100) | 에디터에서 보여 줄 이름 |
| glb_url | varchar(255), nullable | GLB 파일 주소. `null`이면 렌더링되는 geometry가 없는 "빈 오브젝트". |
| position / rotation / scale | jsonb, 기본 `[0,0,0]`/`[0,0,0]`/`[1,1,1]` | 위치·회전·크기. `[x,y,z]` 배열. `parent_object_id`가 있으면 부모 기준 로컬 좌표. |
| cast_shadow / receive_shadow | boolean, 기본 true | 그림자 설정 |
| blocks_movement | boolean, 기본 true | 캐릭터 충돌 처리 여부 |
| collider_shape | varchar(20), 기본 `'box'`, `box`\|`cylinder` | 충돌 판정 모양 |
| use_gravity | boolean, 기본 false | 로드 시 바닥까지 낙하시킬지 여부 |
| is_spawn_point | boolean, 기본 false | 이 방의 캐릭터 스폰 위치/방향 마커인지 |
| visible | boolean, 기본 true | 에디터 하이라키에서 껐다 켠 표시 상태(순수 편집 편의, 충돌엔 영향 없음) |
| parent_object_id | uuid, FK → map_object(자기참조), nullable | 부모 오브젝트 ID. 부모 삭제 시 `SET NULL`(자식이 통째로 같이 삭제되진 않음). |
| created_at | timestamptz | 만든 시각 |

### map_door

문 하나(문 하나 = `doorId` 하나)의 **잠금 상태를 한 번만** 저장하는 테이블. 방마다 따로 두지 않는 이유는 아래 `map_door_edge` 설명 참고.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 문 ID (프론트 JSON의 `doorId`와 대응) |
| lock_type | varchar(20), 기본 `'none'`, `none`\|`button`\|`password`\|`key` | 잠금 방식. `key`는 UI만 있고 실제 로직은 인벤토리 시스템이 생기기 전까지 미구현. |
| password | varchar(100), 기본 `''` | `lock_type`이 `password`일 때만 의미 있음 |
| required_button_object_id | uuid, FK → map_object, nullable | `lock_type`이 `button`일 때 눌러야 하는 버튼 오브젝트. 그 오브젝트 삭제 시 `SET NULL`. |
| created_at | timestamptz | 만든 시각 |

### map_door_edge

문의 **방 쪽 절반**(어느 방, 어느 벽 칸/변에 뚫려있고 어디로 이어지는지)을 저장한다. 문 하나(`door_id` 값 하나)는 항상 이 테이블에 **정확히 두 행**을 갖는다 — 서로 마주보는 두 방 각각의 벽면 기준으로 하나씩. `UNIQUE(door_id, room_id)`로 같은 문이 한 방에 중복 등록되는 걸 막는다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 이 방 쪽에서 본 door-edge 행 ID |
| door_id | uuid, FK → map_door | 이 문의 식별자. 반대쪽 행과 이 값이 같다. |
| room_id | uuid, FK → map_room | 이 문이 뚫린 방 ID |
| x / z | smallint | 이 방의 `floor_cells` 기준 어느 칸에 문이 있는지 |
| side | varchar(1), `N`\|`S`\|`W`\|`E` | 그 칸의 어느 변에 문이 있는지 |
| connected_room_id | uuid, FK → map_room | 이 문을 통과하면 이동하는 방 ID |
| created_at | timestamptz | 만든 시각 |

**왜 잠금 정보를 `map_door_edge`가 아니라 `map_door`에 따로 뒀는가**: 예전 설계(에디터의 `doorEdges` JSON 필드 그대로)처럼 두 행 각각에 `lockType`/`password`를 넣고 "둘 중 `room_id`가 더 작은 쪽만 진짜 값" 같은 애플리케이션 레벨 규칙으로 관리하면, 그 규칙을 코드가 어디선가 안 지키는 순간 "한쪽에서는 잠겨있고 반대쪽에서는 안 잠긴" 모순 데이터가 생길 수 있다(실제로 에디터 개발 중 이 문제로 버그가 한 번 났었다 — `ctx.resolveCanonicalDoorEdge`로 고쳤다). `map_door`를 따로 둬서 잠금 정보가 물리적으로 한 곳에만 존재하게 만들면 그 모순 자체가 스키마 레벨에서 불가능해진다.

### map_interaction

오브젝트를 상호작용(G키 또는 클릭)했을 때 여는 동작을 저장한다. `object_id`는 `map_object.id`를 가리키고 `UNIQUE`라서 오브젝트 하나당 최대 하나만 붙을 수 있다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | uuid, PK | 상호작용 ID |
| object_id | uuid, FK → map_object, UNIQUE | 대상 오브젝트 ID |
| interaction_type | varchar(20), `memo`\|`choice`\|`image`\|`button` | 상호작용 종류 |
| memo_text | text, nullable | `memo`일 때만: 보여줄 텍스트 |
| choice_options | jsonb, nullable | `choice`일 때만: `[{"label":..., "resultText":...}, ...]` |
| bg_image_url | varchar(255), nullable | `image`일 때만: 모달에 표시할 2D 배경 이미지 |
| created_at | timestamptz | 만든 시각 |

`button`은 별도 필드가 없다 — 타입 자체가 마킹 역할이고, `map_door.required_button_object_id`가 이 오브젝트를 가리키는 것으로 문과 연결된다. 눌렸는지 여부는 맵 원본이 아니라 게임방 진행 상태(Redis)로 추적된다. `required_item_id`/`reward_item_id`/`click_regions` 같은 아이템·인벤토리 연동 필드는 인벤토리 시스템이 실제로 만들어지기 전까지는 없다(설계만 확정 — 개인별이 아니라 팀 공유 인벤토리로 갈 예정).

## Redis — 게임방 진행 상태

맵 원본과 달리 **게임방(세션) 하나에 한정된 휘발성 데이터**다. 문/버튼/아이템은 팀 전체가 공유하는 상태(개인별 인벤토리가 아니라는 설계 결정과 동일한 원칙)라 세션당 하나씩만 있으면 되고, 각 플레이어가 독립적으로 다른 방에 있을 수 있는 위치 정보만 플레이어별로 따로 둔다. 키는 `session:{sessionId}:...` 형태로 세션 단위 네임스페이스를 준다.

| 키 | 타입 | 내용 |
| --- | --- | --- |
| `session:{sessionId}:meta` | hash | `mapId`, `status`(대기\|진행중\|종료), `startedAt`, `endsAt` |
| `session:{sessionId}:participants` | set | 현재 접속 중인 플레이어 id |
| `session:{sessionId}:player:{playerId}` | hash | `currentRoomId`, `position`, `connectedAt` — 플레이어별로 다른 유일한 상태 |
| `session:{sessionId}:pressedButtons` | set | 눌린 버튼 오브젝트 id(`map_object.id`) — `map_door.required_button_object_id`와 대조해서 문 해금 판정 |
| `session:{sessionId}:unlockedDoors` | set | 열린 문 id(`map_door.id`) — 비밀번호 성공/버튼 눌림으로 추가 |
| `session:{sessionId}:inventory` | set | 팀이 획득한 아이템 id (인벤토리 시스템 생기면 사용) |
| `session:{sessionId}:solvedPuzzles` | set | 완료 처리된 choice/퍼즐 오브젝트 id — 중복 완료 방지, 진행률 계산용 |

- 세션이 끝나면(탈출 성공/시간 초과) 이 키들은 원본을 계속 보관할 필요가 없으므로 TTL로 자동 만료시킨다. 기록을 남기고 싶으면(리더보드 등) 종료 시점에 요약값만 Postgres의 별도 테이블(예: `game_session_result` — 아직 안 만듦)로 옮겨 적는 식으로 처리한다.
- 실시간 동기화(여러 플레이어에게 상태 변화를 브로드캐스트하는 것)는 이 키-값 구조와는 별개로, 소켓 서버가 Redis pub/sub나 어댑터를 쓰는 방식으로 나중에 붙인다 — 지금 범위(맵 저장/불러오기)에서는 다루지 않는다.

## 맵 에디터용 JSON 구조

맵 저장 API와 게임방이 생기기 전까지는, 방을 만들고 3D에서 바로 테스트해 볼 수 있도록 아래 형태의 JSON 파일 하나로 맵을 정의한다. DB 저장은 이 구조를 `map_room` / `map_door_edge` / `map_object` / `map_interaction` 테이블로 그대로 풀어서 넣는 방식으로 처리한다.

이 구조는 에디터의 `ctx.serializeLayout()`(`src/editor/persistence.js`)이 실제로 만들어내는 형태를 그대로 옮긴 것이다.

```json
{
  "rooms": [
    {
      "id": "room-1",
      "roomName": "거실",
      "isStartRoom": true,
      "initialSpawnPos": [0, 0, 2.3],
      "floorCells": [{ "x": -3, "z": -4 }, { "x": -2, "z": -4 }],
      "doorEdges": [
        {
          "x": 1,
          "z": 3,
          "side": "S",
          "connectedRoomId": "room-2",
          "doorId": "570ca8d9-1626-47bc-a2fd-8510504f69a1",
          "lockType": "button",
          "password": "",
          "requiredButtonId": "obj-8"
        }
      ],
      "worldOffset": { "x": 0, "z": 0 },
      "objects": [
        {
          "id": "obj-1",
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
          "useGravity": false,
          "isSpawnPoint": false,
          "visible": true,
          "parentObjectId": null,
          "interaction": null
        },
        {
          "id": "obj-8",
          "name": "책상 위 버튼",
          "glbUrl": "/models/assets/curated__button.glb",
          "transform": { "position": [1.5, 0.8, -3.2], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
          "castShadow": true,
          "receiveShadow": true,
          "blocksMovement": false,
          "colliderShape": "box",
          "useGravity": false,
          "isSpawnPoint": false,
          "visible": true,
          "parentObjectId": "obj-1",
          "interaction": { "interactionType": "button", "bgImageUrl": null, "memoText": null, "choiceOptions": null }
        }
      ]
    },
    {
      "id": "room-2",
      "roomName": "복도",
      "isStartRoom": false,
      "initialSpawnPos": [0, 0, 0],
      "floorCells": [{ "x": 1, "z": 4 }, { "x": 2, "z": 4 }],
      "doorEdges": [
        {
          "x": 1,
          "z": 3,
          "side": "N",
          "connectedRoomId": "room-1",
          "doorId": "570ca8d9-1626-47bc-a2fd-8510504f69a1",
          "lockType": "none",
          "password": "",
          "requiredButtonId": null
        }
      ],
      "worldOffset": { "x": -4, "z": 7 },
      "objects": []
    }
  ]
}
```

- **문은 오브젝트가 아니라 방의 `doorEdges` 배열 항목이다.** 벽 어느 칸(`x`,`z`)의 어느 변(`side`: `N`\|`S`\|`W`\|`E`)이 뚫려있는지, 그리고 그 문이 어느 방(`connectedRoomId`)으로 이어지는지를 나타낸다. 위 예시처럼 문 하나는 **두 방 각각의 `doorEdges`에 한 항목씩, 총 두 개**로 존재한다(서로 마주보는 벽면이라서).
- `doorId`는 같은 문의 반대쪽 항목과 짝을 맞추는 유일한 값이다. `crypto.randomUUID()`로 한 번 생성해서 양쪽에 똑같이 박아 넣고, 세션마다 바뀌는 방/오브젝트 id(`room-N`/`obj-N`)와 달리 리매핑이 필요 없다.
- **잠금 상태(`lockType`/`password`/`requiredButtonId`)는 논리적으로 문 하나에만 속하지, 두 항목 각각에 속하지 않는다.** 두 방 중 `id`가 사전순/숫자순으로 더 앞선 쪽 항목만 실제 값을 갖고, 반대쪽은 항상 `lockType: "none"`으로 비워둔 채 저장된다(위 예시에서 `room-1` 쪽만 `button` 잠금을 갖고 `room-2` 쪽은 `none`인 이유). 에디터는 이걸 `ctx.resolveCanonicalDoorEdge`로 처리하며, 두 항목에 서로 다른 잠금값이 들어가면 "한쪽에서는 잠겨있고 반대쪽에서는 안 잠긴" 모순 상태가 된다 — DB 스키마를 짤 때 이 불변식을 반드시 지켜야 한다(위 `map_door_edge`/`map_door` 분리안 참고).
- `lockType`은 `none`(기본) \| `button`(오브젝트를 상호작용해서 누르면 열림, `requiredButtonId`가 그 오브젝트를 가리킴) \| `password`(문 앞에서 G키로 비밀번호 입력) \| `key`(UI 라벨만 있고 아직 미구현 — 인벤토리 시스템이 생기면 채워질 예정).
- **실제 플레이는 순간이동 방식이다.** 모든 방의 3D 콘텐츠는 같은 로컬 원점에 겹쳐서 존재하고, 한 번에 하나의 방만 보이게 켜져 있다(`ctx.applyRoomVisibility`). 문을 통과하면 `connectedRoomId`로 보이는 방을 전환하고 캐릭터를 반대쪽 문의 위치로 즉시 옮긴다(`transitionThroughDoor`) — 처음 계획했던 "배포 시점에 방들을 실제로 안 겹치게 재배치해서 하나의 연속된 씬으로 만든다"는 방식은 채택하지 않았다. `worldOffset`은 순수하게 에디터의 방 연결 패널에서 방들을 겹치지 않게 나란히 보여주기 위한 좌표일 뿐, 게임 로직에는 쓰이지 않는다.
- `floorCells`는 방의 바닥을 구성하는 1x1 격자 칸 목록이다: `[{ "x": 0, "z": 0 }, ...]` 형태이고(칸 `{x,z}`는 그 칸의 최소 모서리 좌표 — 실제 칸은 `[x, x+1] x [z, z+1]` 사각형), 값이 없으면(구버전 데이터 등) `null`이다. 사각형 한 개가 아니라 **임의의 모양(L자 등)을 구성할 수 있는 칸 집합**이다. 이 칸 집합의 경계(이웃 칸이 없는 변)를 따라 **벽이 자동 생성된다**(`ctx.buildRoomWalls`) — `doorEdges`에 있는 변은 전체 높이 벽 대신 문 모델과 그 위 인방(lintel)만 세워진다. 벽/문 지오메트리는 저장하지 않고 매번 `floorCells`+`doorEdges`에서 다시 계산한다.
- `position` / `rotation` / `scale`은 Three.js의 `Vector3.toArray()` / `Euler.toArray()`와 바로 맞도록 `[x, y, z]` 배열로 저장한다. `{x, y, z}` 객체 형태는 쓰지 않는다.
- `blocksMovement`가 `true`(기본값)인 오브젝트는 로드 시 `Box3`로 충돌 영역을 자동 계산해서 캐릭터 이동을 막는다(A* 길찾기가 이 칸들을 피해서 경로를 잡는다). 벽에 붙은 액자나 시계처럼 캐릭터가 닿을 일이 없는 오브젝트는 `false`로 꺼서 불필요한 충돌 계산을 뺀다.
- `colliderShape`는 `box`(기본값) 또는 `cylinder`다. 사각형 가구는 `box`(오브젝트 바운딩 박스로 XZ 평면 사각형 판정), 기둥·원형 오브젝트는 `cylinder`(바운딩 박스에서 반지름을 뽑아 원-원 판정)로 지정한다. `box`로 원형 오브젝트를 감싸면 실제로는 안 닿았는데 모서리 부분에서 막히는 "가짜 충돌"이 생기기 때문에 나눴다.
- `interaction`은 상호작용이 없는 오브젝트가 대부분이라 기본값을 `null`로 둔다. 있을 때만 아래 "interaction 종류"처럼 채운다.
- `glbUrl`이 `null`이면 GLB 없이 껍데기만 있는 "빈 오브젝트"다(유니티의 빈 GameObject와 동일한 개념). 다른 오브젝트를 묶어서 폴더처럼 관리하거나(`parentObjectId`로 자식들을 붙임), 좌표 기준점으로만 쓸 때 사용한다.
- `parentObjectId`는 이 오브젝트가 다른 오브젝트에 소속돼서 같이 움직이는지를 나타낸다. 기본값은 `null`(부모 없음, 방에 직접 배치)이고, 값이 있으면 다른 오브젝트의 `id`를 가리킨다(같은 방일 필요는 없다). `position`/`rotation`/`scale`은 부모 오브젝트 기준 로컬 좌표로 저장되므로, 복원할 때도 부모를 먼저 만든 뒤 자식을 그 아래에 붙여야 한다.
- `visible`(기본값 `true`)은 에디터 하이라키 목록의 눈 아이콘으로 껐다 켰다 하는 값으로, 순수 편집 편의 기능이라 `blocksMovement` 등 충돌 로직에는 영향을 주지 않는다.
- `isSpawnPoint`(기본값 `false`)가 `true`인 오브젝트는 그 방의 캐릭터 스폰 위치/방향을 나타내는 마커다. 방마다 하나만 있을 수 있고, `glbUrl`은 항상 `null`이다. 방 레벨의 `initialSpawnPos`는 이 마커의 `position`에서 저장 시점에 자동으로 계산된다(직접 입력하는 값이 아니다). 이 마커가 없는 방은 맵 중앙 근처의 빈 공간을 자동으로 찾아 스폰한다.

### interaction 종류

에디터 인스펙터의 "상호작용" 탭에서 오브젝트 하나당 아래 네 종류 중 하나만 붙일 수 있다(동시에 여러 개 불가). 문은 오브젝트 상호작용이 아니라 방의 `doorEdges` 쪽에서 다룬다(위 참고).

**메모** — 텍스트 하나만 보여준다.
```json
{ "interactionType": "memo", "bgImageUrl": null, "memoText": "낡은 편지가 있다...", "choiceOptions": null }
```

**선택지** — 플레이어가 고를 수 있는 행동 목록. 지금은 순수 텍스트 분기만 있고(고르면 결과 텍스트만 보여줌), 아이템 지급/요구 조건은 나중에 인벤토리 시스템이 생기면 각 옵션에 필드를 추가하는 식으로 확장한다.
```json
{
  "interactionType": "choice",
  "bgImageUrl": null,
  "memoText": null,
  "choiceOptions": [
    { "label": "바닥을 뒤진다", "resultText": "낡은 열쇠를 발견했다!" },
    { "label": "책상을 뒤진다", "resultText": "아무것도 없다." }
  ]
}
```

**이미지** — 모달에 이미지 하나를 보여준다.
```json
{ "interactionType": "image", "bgImageUrl": "/images/drawer-bg.png", "memoText": null, "choiceOptions": null }
```

**버튼** — 상호작용하면 "눌린" 상태가 된다. 자체 필드는 없고, `doorEdges[].requiredButtonId`가 이 오브젝트의 `id`를 가리키는 것으로 문 잠금과 연결된다. 눌린 상태 자체는 맵 원본이 아니라 게임방(플레이) 진행 상태로 관리된다.
```json
{ "interactionType": "button", "bgImageUrl": null, "memoText": null, "choiceOptions": null }
```

## 저장 원칙

- 맵 정보, 방, 오브젝트, 상호작용은 맵을 만드는 사람이 저장하는 원본 데이터다.
- 플레이어가 퍼즐을 풀며 바꾸는 값은 맵 원본에 저장하지 않는다.
- 아이템 획득, 열린 문, 푼 퍼즐은 나중에 게임방별 데이터로 따로 저장한다.
- 맵을 수정해서 새로 배포하면 새 UUID의 맵으로 저장한다.
