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

## JSON 예시

### 위치, 회전, 크기

```json
{
  "x": 1.5,
  "y": 0,
  "z": -3.2
}
```

### 연결된 방

```json
[
  {
    "roomId": "550e8400-e29b-41d4-a716-446655440000",
    "doorObjectId": "550e8400-e29b-41d4-a716-446655440001"
  }
]
```

### 2D 모달 클릭 영역

```json
[
  {
    "id": "keypad-button-1",
    "x": 120,
    "y": 180,
    "width": 48,
    "height": 48,
    "action": "input:1"
  }
]
```

`x`, `y`, `width`, `height`는 모달 배경 이미지의 원본 크기를 기준으로 저장한다. 화면 크기가 달라져도 같은 비율로 계산해서 클릭 영역을 맞춘다.

## 저장 원칙

- 맵 정보, 방, 오브젝트, 상호작용은 맵을 만드는 사람이 저장하는 원본 데이터다.
- 플레이어가 퍼즐을 풀며 바꾸는 값은 맵 원본에 저장하지 않는다.
- 아이템 획득, 열린 문, 푼 퍼즐은 나중에 게임방별 데이터로 따로 저장한다.
- 맵을 수정해서 새로 배포하면 새 UUID의 맵으로 저장한다.
