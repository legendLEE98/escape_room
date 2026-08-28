import * as THREE from 'three';

const OUTLINE_COLOR = new THREE.Color('#74abe4');
const cylinderTemplate = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false);
const cylinderWireframe = new THREE.WireframeGeometry(cylinderTemplate);

function createBoxOutline(object) {
  const mesh = new THREE.BoxHelper(object, OUTLINE_COLOR);
  return {
    shape: 'box',
    object3d: mesh,
    update() {
      mesh.update();
    },
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}

function createCylinderOutline() {
  const line = new THREE.LineSegments(
    cylinderWireframe,
    new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }),
  );
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  return {
    shape: 'cylinder',
    object3d: line,
    update(object) {
      box.setFromObject(object);
      if (box.isEmpty()) return;
      box.getCenter(center);
      box.getSize(size);
      const radius = Math.max(size.x, size.z) / 2;
      line.position.copy(center);
      line.scale.set(radius, size.y, radius);
    },
    dispose() {
      line.material.dispose();
    },
  };
}

export function initSelectionOutline(ctx) {
  const group = new THREE.Group();
  group.name = 'Selection outlines';
  ctx.scene.add(group);
  ctx.selectionOutlineGroup = group;

  const outlines = new Map();

  ctx.syncSelectionOutlines = () => {
    outlines.forEach((outline, instanceId) => {
      if (!ctx.multiSelection.has(instanceId)) {
        group.remove(outline.object3d);
        outline.dispose();
        outlines.delete(instanceId);
      }
    });

    ctx.placedObjects
      .filter((object) => ctx.multiSelection.has(object.userData.instanceId))
      .forEach((object) => {
        const shape = object.userData.colliderShape === 'cylinder' ? 'cylinder' : 'box';
        const existing = outlines.get(object.userData.instanceId);
        if (existing && existing.shape === shape) return;

        if (existing) {
          group.remove(existing.object3d);
          existing.dispose();
        }

        const outline = shape === 'cylinder' ? createCylinderOutline() : createBoxOutline(object);
        group.add(outline.object3d);
        outlines.set(object.userData.instanceId, outline);
      });
  };

  ctx.updateSelectionOutlines = () => {
    ctx.placedObjects.forEach((object) => {
      const outline = outlines.get(object.userData.instanceId);
      if (outline) outline.update(object);
    });
  };
}
