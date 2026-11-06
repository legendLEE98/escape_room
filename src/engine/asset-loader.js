import * as THREE from 'three';

export function cloneMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material?.clone();
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

export function normalizeAsset(root) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  root.updateMatrixWorld(true);
}

// Parsed GLB scenes, loaded once per file and cloned by whoever places them.
export function initAssetLoader(ctx) {
  ctx.assetCache = new Map();

  ctx.loadAssetTemplate = async (asset) => {
    if (!ctx.assetCache.has(asset.file)) {
      const promise = new Promise((resolve, reject) => {
        ctx.loader.load(asset.url, (gltf) => resolve(gltf.scene), undefined, reject);
      });
      ctx.assetCache.set(asset.file, promise);
    }
    return ctx.assetCache.get(asset.file);
  };
}
