import * as THREE from 'three';
import { edgeMidpoint } from '../../engine/room-doors.js';
import { createNameTag } from '../../engine/name-tag.js';

// A short text over each door of the room being edited saying whether anything
// is hooked up to it — so an unconnected door stands out without opening the
// interaction tab. Editor mode only; the text follows the door's lock settings
// (read from the canonical edge, where the lock actually lives).
const LABEL_BASE_HEIGHT = 1.0; // + the name tag's own offset ≈ just above the door frame

export function initDoorLabels(ctx) {
  // edge -> { tag, anchor }
  const labels = new Map();

  function describe(room, edge) {
    const lock = describeLock(room, edge);
    if (!edge.isExit) return lock;
    return lock === '연결 없음' ? '탈출구' : `탈출구 · ${lock.replace('연결: ', '')}`;
  }

  function describeLock(room, edge) {
    const { edge: canonical } = ctx.resolveCanonicalDoorEdge(room, edge);
    const lockType = canonical.lockType || 'none';
    if (lockType === 'password') return '연결: 비밀번호';
    if (lockType === 'key') return '연결: 열쇠';
    if (lockType === 'button') {
      const key = ctx.playState.requiredButtonKey(canonical);
      if (key == null) return '버튼 미지정';
      const button = ctx.placedObjects.find((object) => ctx.playState.buttonKey(object) === key);
      return button ? `연결: ${button.name}` : '연결: 버튼';
    }
    return '연결 없음';
  }

  function removeLabel(edge) {
    const label = labels.get(edge);
    if (!label) return;
    label.tag.dispose();
    labels.delete(edge);
  }

  // Called every frame.
  ctx.updateDoorLabels = () => {
    const live = new Set();
    const showing = ctx.currentMode === 'editor';
    ctx.rooms.forEach((room) => {
      const isCurrent = room.instanceId === ctx.currentRoomInstanceId;
      (room.doorEdges || []).forEach((edge) => {
        live.add(edge);
        let label = labels.get(edge);
        if (!label) {
          const mid = edgeMidpoint(edge);
          const anchor = new THREE.Object3D();
          anchor.position.set(mid.x, LABEL_BASE_HEIGHT, mid.z);
          label = { tag: createNameTag(ctx, describe(room, edge), anchor), anchor };
          labels.set(edge, label);
        }
        const text = describe(room, edge);
        if (label.tag.text !== text) label.tag.setText(text);
        label.tag.sprite.visible = showing && isCurrent;
        if (label.tag.sprite.visible) label.tag.update();
      });
    });
    // Doors that were removed (or whose room was).
    [...labels.keys()].forEach((edge) => {
      if (!live.has(edge)) removeLabel(edge);
    });
  };

  // For tests and debugging: what each live label currently says.
  ctx.getDoorLabelTexts = () => [...labels.values()].map((label) => label.tag.text);

  ctx.addDisposer(() => [...labels.keys()].forEach(removeLabel));
}
