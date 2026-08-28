import * as THREE from 'three';

function labelFromFilename(file) {
  return file
    .replace(/\.glb$/i, '')
    .replace(/__/g, ' / ')
    .replace(/[-_]/g, ' ');
}

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

export function initAssetCatalog(ctx) {
  ctx.assetCatalog = [];
  ctx.filteredAssets = [];
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

  ctx.fetchAssetCatalog = async () => {
    const sources = ['/models/assets/manifest.json', '/models/assets/asset-index.json'];

    for (const source of sources) {
      try {
        const response = await fetch(source, { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        const records = Array.isArray(data.assets)
          ? data.assets
          : (data.files || []).map((file) => ({ file }));
        if (!records.length) continue;

        ctx.assetCatalog = records.map((record) => ({
          file: record.file,
          label: record.root || labelFromFilename(record.file),
          collection: record.collection || '',
          url: `/models/assets/${record.file.split('/').map(encodeURIComponent).join('/')}`,
        }));
        ctx.assetCatalog.sort((left, right) =>
          left.label.localeCompare(right.label, 'ko', { numeric: true }),
        );
        ctx.assetCount.textContent = `${ctx.assetCatalog.length} assets`;
        ctx.renderAssetOptions();
        ctx.editorStatus.textContent = `${ctx.assetCatalog.length}개 에셋을 사용할 수 있습니다.`;
        await ctx.restoreLayout();
        return;
      } catch (error) {
        console.warn(`Asset catalog unavailable: ${source}`, error);
      }
    }

    ctx.assetCatalog = [];
    ctx.assetCount.textContent = '0 assets';
    ctx.addAssetButton.disabled = true;
    ctx.editorStatus.textContent =
      'public/models/assets에 GLB를 넣고 npm run assets:index를 실행해 주세요.';
  };
}
