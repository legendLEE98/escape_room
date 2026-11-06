// The waiting area every game room starts in: one fixed room, same for all
// rooms and independent of the map being played. Written in the same JSON
// shape the server returns for a map layout, so the engine's layout loader
// builds it exactly like any other room.

const WIDTH = 11;
const DEPTH = 7;

// An L-shaped floor: the north-east corner is cut out (x 8..10, z 0..1) so the
// room has some shape to walk around instead of being a plain box.
const floorCells = [];
for (let z = 0; z < DEPTH; z += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    if (x >= 8 && z <= 1) continue;
    floorCells.push({ x, z });
  }
}

let nextId = 1;
function furniture(name, file, x, z, rotationY = 0) {
  return {
    id: `lobby-obj-${nextId++}`,
    name,
    glbUrl: `/models/assets/office/${file}`,
    transform: { position: [x, 0, z], rotation: [0, rotationY, 0], scale: [1, 1, 1] },
    castShadow: true,
    receiveShadow: true,
    blocksMovement: true,
    colliderShape: 'box',
    useGravity: false,
    isSpawnPoint: false,
    visible: true,
    parentObjectId: null,
    interaction: null,
  };
}

export const LOBBY_SPAWN = [5.5, 0, 4.6];

export const LOBBY_LAYOUT = {
  rooms: [
    {
      id: 'lobby',
      roomName: '대기실',
      isStartRoom: true,
      initialSpawnPos: LOBBY_SPAWN,
      floorCells,
      worldOffset: { x: 0, z: 0 },
      doorEdges: [],
      objects: [
        {
          id: 'lobby-spawn',
          name: '스폰 위치',
          glbUrl: null,
          transform: { position: LOBBY_SPAWN, rotation: [0, 0, 0], scale: [1, 1, 1] },
          castShadow: true,
          receiveShadow: true,
          blocksMovement: false,
          colliderShape: 'box',
          useGravity: false,
          isSpawnPoint: true,
          visible: true,
          parentObjectId: null,
          interaction: null,
        },
        furniture('회의 테이블', 'desk-06.glb', 4.6, 2.6),
        furniture('책장', 'cabinet-03.glb', 2.2, 0.55),
        furniture('캐비닛', 'cabinet-07.glb', 6.4, 0.55),
        furniture('소파', 'chair-03.glb', 1.1, 4.9, Math.PI / 2),
        furniture('정수기', 'equipment-04.glb', 7.5, 0.6),
        furniture('화분', 'decor-04.glb', 0.6, 0.6),
        furniture('안내 데스크', 'equipment-03.glb', 9.4, 4.2, -Math.PI / 2),
      ],
    },
  ],
};
