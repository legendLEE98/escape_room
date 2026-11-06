import * as THREE from 'three';
import { cloneMaterials, normalizeAsset } from './asset-loader.js';

// Turns a saved/placed item into a live scene object inside its room, with
// the flags the game logic reads (blocksMovement, interaction, ...). This is
// only the scene side — selection, hierarchy and saving are editor concerns
// layered on top in editor/assets/placement.js.
export function initObjectFactory(ctx) {
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
    return ctx.rooms.find((room) => room.instanceId === roomInstanceId)?.root ?? ctx.worldRoot;
  }

  function applyTransform(container, transform) {
    if (!transform) return;
    container.position.fromArray(transform.position);
    container.rotation.fromArray(transform.rotation);
    container.scale.fromArray(transform.scale);
    if (transform.name) container.name = transform.name;
  }

  function applyObjectFlags(container, transform, defaultBlocksMovement) {
    container.userData.blocksMovement = transform?.blocksMovement ?? defaultBlocksMovement;
    container.userData.colliderShape = transform?.colliderShape ?? 'box';
    container.userData.useGravity = transform?.useGravity ?? false;
    container.userData.interactionType = transform?.interactionType ?? null;
    container.userData.bgImageUrl = transform?.bgImageUrl ?? null;
    container.userData.memoText = transform?.memoText ?? null;
    container.userData.choiceOptions = transform?.choiceOptions ?? null;
    container.userData.parentInstanceId = null;
  }

  function addToRoom(container, roomInstanceId) {
    getRoomRoot(roomInstanceId ?? ctx.currentRoomInstanceId).add(container);
    ctx.placedObjects.push(container);
    return container;
  }

  // `asset` needs { file, url, label }; `transform` is a saved item (or null
  // for a freshly placed one at the origin). Rejects if the GLB can't load.
  ctx.createAssetObject = async (asset, transform = null) => {
    const template = await ctx.loadAssetTemplate(asset);
    const content = template.clone(true);
    cloneMaterials(content);
    normalizeAsset(content);
    const container = createPlacedContainer(asset, content);
    applyTransform(container, transform);
    applyObjectFlags(container, transform, true);
    return addToRoom(container, transform?.roomInstanceId);
  };

  ctx.createEmptyObject = (transform = null) => {
    const container = createPlacedContainer(
      { file: null, url: null, label: '빈 오브젝트' },
      new THREE.Group(),
    );
    applyTransform(container, transform);
    applyObjectFlags(container, transform, false);
    return addToRoom(container, transform?.roomInstanceId);
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

  ctx.createSpawnPointObject = (transform = null) => {
    const container = createPlacedContainer(
      { file: null, url: null, label: '스폰 위치' },
      createSpawnPointMarker(),
    );
    container.userData.isSpawnPoint = true;
    applyTransform(container, transform);
    container.userData.blocksMovement = false;
    container.userData.colliderShape = 'box';
    container.userData.useGravity = false;
    container.userData.interactionType = null;
    container.userData.parentInstanceId = null;
    return addToRoom(container, transform?.roomInstanceId);
  };
}
