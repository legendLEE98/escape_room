import * as THREE from 'three';
import { cloneMaterials, normalizeAsset } from './catalog.js';

export function initPlacement(ctx) {
  ctx.placedObjects = [];
  ctx.nextInstanceId = 1;

  function createPlacedContainer(asset, content) {
    const container = new THREE.Group();
    container.name = `${asset.label} ${ctx.nextInstanceId}`;
    container.userData.editorAsset = true;
    container.userData.assetFile = asset.file;
    container.userData.assetUrl = asset.url;
    container.userData.assetLabel = asset.label;
    container.userData.instanceId = ctx.nextInstanceId++;
    container.add(content);
    return container;
  }

  ctx.addAsset = async (asset, transform = null, shouldSave = true) => {
    if (!asset) return null;
    ctx.editorStatus.textContent = `${asset.label} 불러오는 중...`;
    ctx.addAssetButton.disabled = true;

    try {
      const template = await ctx.loadAssetTemplate(asset);
      const content = template.clone(true);
      cloneMaterials(content);
      normalizeAsset(content);
      const container = createPlacedContainer(asset, content);

      if (transform) {
        container.position.fromArray(transform.position);
        container.rotation.fromArray(transform.rotation);
        container.scale.fromArray(transform.scale);
        if (transform.name) container.name = transform.name;
      }
      container.userData.roomInstanceId = transform?.roomInstanceId ?? ctx.currentRoomInstanceId;
      container.userData.blocksMovement = transform?.blocksMovement ?? true;
      container.userData.colliderShape = transform?.colliderShape ?? 'box';
      container.userData.useGravity = transform?.useGravity ?? false;

      ctx.editorRoot.add(container);
      ctx.placedObjects.push(container);
      ctx.selectEditorObject(container);
      ctx.syncHierarchy();
      if (shouldSave) ctx.saveLayout();
      ctx.editorStatus.textContent = `${asset.label}을 배치했습니다.`;
      return container;
    } catch (error) {
      console.error(error);
      ctx.editorStatus.textContent = `${asset.label}을 불러오지 못했습니다.`;
      return null;
    } finally {
      ctx.addAssetButton.disabled = ctx.assetCatalog.length === 0;
    }
  };
}
