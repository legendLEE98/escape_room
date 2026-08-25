import * as THREE from 'three';

export function initGravity(ctx) {
  const box = new THREE.Box3();
  const otherBox = new THREE.Box3();

  ctx.computeGroundedY = (object) => {
    box.setFromObject(object);
    if (box.isEmpty()) return object.position.y;

    let restY = 0;
    ctx.placedObjects.forEach((other) => {
      if (other === object) return;
      otherBox.setFromObject(other);
      if (otherBox.isEmpty()) return;
      const overlapsX = box.min.x < otherBox.max.x && box.max.x > otherBox.min.x;
      const overlapsZ = box.min.z < otherBox.max.z && box.max.z > otherBox.min.z;
      if (overlapsX && overlapsZ) restY = Math.max(restY, otherBox.max.y);
    });
    return restY;
  };

  ctx.applyGravityToObject = (object) => {
    if (!object.userData.useGravity) return;
    object.position.y = ctx.computeGroundedY(object);
  };

  ctx.applyGravityToSelection = () => {
    ctx.placedObjects
      .filter((object) => ctx.multiSelection.has(object.userData.instanceId))
      .forEach((object) => ctx.applyGravityToObject(object));
  };
}
