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

  function getRoomRoot(roomInstanceId) {
    return ctx.rooms.find((room) => room.instanceId === roomInstanceId)?.root ?? ctx.editorRoot;
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
      container.userData.blocksMovement = transform?.blocksMovement ?? true;
      container.userData.colliderShape = transform?.colliderShape ?? 'box';
      container.userData.useGravity = transform?.useGravity ?? false;
      container.userData.interactionType = transform?.interactionType ?? null;
      container.userData.connectedRoomId = transform?.connectedRoomId ?? null;
      container.userData.parentInstanceId = null;

      getRoomRoot(transform?.roomInstanceId ?? ctx.currentRoomInstanceId).add(container);
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

  ctx.addEmptyObject = (transform = null, shouldSave = true) => {
    const container = createPlacedContainer(
      { file: null, url: null, label: '빈 오브젝트' },
      new THREE.Group(),
    );

    if (transform) {
      container.position.fromArray(transform.position);
      container.rotation.fromArray(transform.rotation);
      container.scale.fromArray(transform.scale);
      if (transform.name) container.name = transform.name;
    }
    container.userData.blocksMovement = transform?.blocksMovement ?? false;
    container.userData.colliderShape = transform?.colliderShape ?? 'box';
    container.userData.useGravity = transform?.useGravity ?? false;
    container.userData.interactionType = transform?.interactionType ?? null;
    container.userData.connectedRoomId = transform?.connectedRoomId ?? null;
    container.userData.parentInstanceId = null;

    getRoomRoot(transform?.roomInstanceId ?? ctx.currentRoomInstanceId).add(container);
    ctx.placedObjects.push(container);
    ctx.selectEditorObject(container);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = '빈 오브젝트를 추가했습니다.';
    return container;
  };

  function createSpawnPointMarker() {
    const content = new THREE.Group();

    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x14532d, emissiveIntensity: 0.4 }),
    );
    marker.position.y = 0.2;
    content.add(marker);

    const facing = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x4ade80 }),
    );
    facing.rotation.x = Math.PI / 2;
    facing.position.set(0, 0.05, 0.35);
    content.add(facing);

    return content;
  }

  ctx.addSpawnPoint = (transform = null, shouldSave = true) => {
    const roomInstanceId = transform?.roomInstanceId ?? ctx.currentRoomInstanceId;

    if (!transform) {
      const existing = ctx.placedObjects.find(
        (object) => object.userData.isSpawnPoint && ctx.getObjectRoomInstanceId(object) === roomInstanceId,
      );
      if (existing) {
        ctx.selectEditorObject(existing);
        ctx.editorStatus.textContent = '이미 이 방에 스폰 위치가 있습니다.';
        return existing;
      }
    }

    const container = createPlacedContainer(
      { file: null, url: null, label: '스폰 위치' },
      createSpawnPointMarker(),
    );
    container.userData.isSpawnPoint = true;

    if (transform) {
      container.position.fromArray(transform.position);
      container.rotation.fromArray(transform.rotation);
      container.scale.fromArray(transform.scale);
      if (transform.name) container.name = transform.name;
    }
    container.userData.blocksMovement = false;
    container.userData.colliderShape = 'box';
    container.userData.useGravity = false;
    container.userData.interactionType = null;
    container.userData.connectedRoomId = null;
    container.userData.parentInstanceId = null;

    getRoomRoot(roomInstanceId).add(container);
    ctx.placedObjects.push(container);
    ctx.selectEditorObject(container);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = '스폰 위치를 추가했습니다.';
    return container;
  };
}
