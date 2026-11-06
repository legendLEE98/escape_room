import * as THREE from 'three';

// Pointer picking and the held-key set that movement reads. Key bindings are
// left to whoever owns the screen (the editor and the game map keys
// differently); they just add/remove codes on ctx.pressedKeys.
export function initInput(ctx) {
  ctx.raycaster = new THREE.Raycaster();
  ctx.pointer = new THREE.Vector2();
  ctx.pressedKeys = new Set();

  ctx.setPointer = (event) => {
    const bounds = ctx.canvas.getBoundingClientRect();
    ctx.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    ctx.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  };
}
