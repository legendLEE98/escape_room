import * as THREE from 'three';

const TAG_CANVAS_WIDTH = 512;
const TAG_CANVAS_HEIGHT = 128;
// Floats above the character's head (their feet are at the target's position).
const TAG_HEIGHT = 1.4 * 0.8;
// World size at camera zoom 1; divided by the zoom so the label stays the same
// size on screen when the camera zooms.
const TAG_WORLD_WIDTH = 2.4;
const TAG_WORLD_HEIGHT = (TAG_WORLD_WIDTH * TAG_CANVAS_HEIGHT) / TAG_CANVAS_WIDTH;

function drawLabel(canvas, text) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);

  let fontSize = 54;
  g.font = `700 ${fontSize}px system-ui, "Noto Sans KR", sans-serif`;
  const maxTextWidth = canvas.width - 64;
  while (g.measureText(text).width > maxTextWidth && fontSize > 24) {
    fontSize -= 2;
    g.font = `700 ${fontSize}px system-ui, "Noto Sans KR", sans-serif`;
  }

  const textWidth = g.measureText(text).width;
  const pillWidth = Math.min(canvas.width - 8, textWidth + 56);
  const pillHeight = 84;
  const x = (canvas.width - pillWidth) / 2;
  const y = (canvas.height - pillHeight) / 2;

  g.fillStyle = 'rgba(12, 17, 25, 0.82)';
  g.strokeStyle = 'rgba(143, 197, 255, 0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, pillWidth, pillHeight, pillHeight / 2);
  g.fill();
  g.stroke();

  g.fillStyle = '#eaf0f8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
}

// A label sprite that stays the same size on screen whatever the camera zoom,
// for fixed spots in the world (not following anything). Textures are cached
// per text, so rebuilding it every frame — e.g. while dragging a ghost room —
// doesn't pile up canvases.
const labelTextures = new Map();
export function createWorldLabel(ctx, text, position) {
  let texture = labelTextures.get(text);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = TAG_CANVAS_WIDTH;
    canvas.height = TAG_CANVAS_HEIGHT;
    drawLabel(canvas, text);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    labelTextures.set(text, texture);
  }
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  sprite.position.copy(position);
  sprite.onBeforeRender = () => {
    const scale = 1 / ctx.camera.zoom;
    sprite.scale.set(TAG_WORLD_WIDTH * scale, TAG_WORLD_HEIGHT * scale, 1);
  };
  return sprite;
}

// A name label that follows `target` (an Object3D, e.g. a character rig's
// group). Call update() every frame; dispose() when the player goes away.
export function createNameTag(ctx, text, target) {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_CANVAS_WIDTH;
  canvas.height = TAG_CANVAS_HEIGHT;
  drawLabel(canvas, text);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // depthTest off so a wall or furniture never hides someone's name.
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  ctx.scene.add(sprite);

  let currentText = text;
  return {
    sprite,
    get text() {
      return currentText;
    },
    setText(next) {
      currentText = next;
      drawLabel(canvas, next);
      texture.needsUpdate = true;
    },
    update() {
      sprite.position.set(target.position.x, target.position.y + TAG_HEIGHT, target.position.z);
      const scale = 1 / ctx.camera.zoom;
      sprite.scale.set(TAG_WORLD_WIDTH * scale, TAG_WORLD_HEIGHT * scale, 1);
    },
    dispose() {
      sprite.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}
