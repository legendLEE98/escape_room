import * as THREE from 'three';

const OUTLINE_COLOR = new THREE.Color('#74abe4');

export function initSelectionOutline(ctx) {
  const group = new THREE.Group();
  group.name = 'Selection outlines';
  ctx.scene.add(group);
  ctx.selectionOutlineGroup = group;

  const helpers = new Map();

  ctx.syncSelectionOutlines = () => {
    helpers.forEach((helper, instanceId) => {
      if (!ctx.multiSelection.has(instanceId)) {
        group.remove(helper);
        helper.dispose();
        helpers.delete(instanceId);
      }
    });

    ctx.placedObjects
      .filter((object) => ctx.multiSelection.has(object.userData.instanceId))
      .forEach((object) => {
        if (helpers.has(object.userData.instanceId)) return;
        const helper = new THREE.BoxHelper(object, OUTLINE_COLOR);
        group.add(helper);
        helpers.set(object.userData.instanceId, helper);
      });
  };

  ctx.updateSelectionOutlines = () => {
    helpers.forEach((helper) => helper.update());
  };
}
