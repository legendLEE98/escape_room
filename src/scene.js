import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

export function createScene(canvas, mapId) {
const sidebarLeft = $('.sidebar-left');
const sidebarRight = $('.sidebar-right');
const sidebarLeftToggle = $('#sidebar-left-toggle');
const sidebarRightToggle = $('#sidebar-right-toggle');
const editorHint = $('.editor-hint');
const editorStatus = $('#editor-status');
const assetSearch = $('#asset-search');
const assetSelect = $('#asset-select');
const assetCount = $('#asset-count');
const addAssetButton = $('#add-asset');
const hierarchyList = $('#hierarchy-list');
const inspectorEmpty = $('#inspector-empty');
const inspectorBody = $('#inspector-body');
const inspectorPosX = $('#inspector-pos-x');
const inspectorPosY = $('#inspector-pos-y');
const inspectorPosZ = $('#inspector-pos-z');
const inspectorRotX = $('#inspector-rot-x');
const inspectorRotY = $('#inspector-rot-y');
const inspectorRotZ = $('#inspector-rot-z');
const inspectorScaleX = $('#inspector-scale-x');
const inspectorScaleY = $('#inspector-scale-y');
const inspectorScaleZ = $('#inspector-scale-z');
const inspectorBgImage = $('#inspector-bg-image');
const inspectorBgPreview = $('#inspector-bg-preview');
const duplicateButton = $('#duplicate-object');
const deleteButton = $('#delete-object');
const assetPreviewCanvas = $('#asset-preview');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0c1119');

const camera = new THREE.OrthographicCamera();
const cameraOffset = new THREE.Vector3(8, 10, 8);
const cameraTarget = new THREE.Vector3();
const clock = new THREE.Clock();
const loader = new GLTFLoader();

scene.add(new THREE.HemisphereLight('#c9dcff', '#172033', 2.2));

const keyLight = new THREE.DirectionalLight('#fff4df', 4);
keyLight.position.set(5, 10, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -20;
keyLight.shadow.camera.right = 20;
keyLight.shadow.camera.top = 20;
keyLight.shadow.camera.bottom = -20;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight('#6aa7ff', 2.5);
rimLight.position.set(-5, 4, -4);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshStandardMaterial({
    color: '#17202c',
    roughness: 0.92,
    metalness: 0.05,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(30, 30, '#4b6079', '#253246');
grid.position.y = 0.01;
grid.material.opacity = 0.38;
grid.material.transparent = true;
scene.add(grid);

const navigationSurface = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  }),
);
navigationSurface.rotation.x = -Math.PI / 2;
navigationSurface.position.y = 0.02;
scene.add(navigationSurface);

const destinationMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.22, 0.32, 40),
  new THREE.MeshBasicMaterial({
    color: '#7cb3ff',
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  }),
);
destinationMarker.rotation.x = -Math.PI / 2;
destinationMarker.position.y = 0.035;
destinationMarker.visible = false;
scene.add(destinationMarker);

const character = new THREE.Group();
scene.add(character);

const editorRoot = new THREE.Group();
editorRoot.name = 'Editor objects';
scene.add(editorRoot);

const orbitControls = new OrbitControls(camera, canvas);
orbitControls.enabled = false;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.screenSpacePanning = true;
orbitControls.target.set(0, 0.8, 0);
orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
orbitControls.minZoom = 0.35;
orbitControls.maxZoom = 4;

const transformControls = new TransformControls(camera, canvas);
transformControls.enabled = false;
transformControls.setSize(0.72);
transformControls.setMode('translate');
transformControls.setTranslationSnap(0.1);
transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
transformControls.setScaleSnap(0.1);
scene.add(transformControls.getHelper());

let multiTransformSnapshot = null;
let suppressNextCanvasClick = false;

transformControls.addEventListener('dragging-changed', (event) => {
  orbitControls.enabled = !event.value && currentMode === 'editor';
  if (event.value) {
    if (multiSelection.size > 1 && selectedEditorObject) {
      multiTransformSnapshot = new Map();
      placedObjects
        .filter((object) => multiSelection.has(object.userData.instanceId))
        .forEach((object) => {
          multiTransformSnapshot.set(object.userData.instanceId, {
            position: object.position.clone(),
            quaternion: object.quaternion.clone(),
            scale: object.scale.clone(),
          });
        });
    } else {
      multiTransformSnapshot = null;
    }
  } else {
    multiTransformSnapshot = null;
    suppressNextCanvasClick = true;
    saveLayout();
  }
});

function applyMultiTransformDelta() {
  if (!multiTransformSnapshot || !selectedEditorObject) return;
  const primarySnapshot = multiTransformSnapshot.get(selectedEditorObject.userData.instanceId);
  if (!primarySnapshot) return;

  const deltaPosition = selectedEditorObject.position.clone().sub(primarySnapshot.position);
  const deltaQuaternion = selectedEditorObject.quaternion
    .clone()
    .multiply(primarySnapshot.quaternion.clone().invert());
  const deltaScale = selectedEditorObject.scale.clone().divide(primarySnapshot.scale);

  multiTransformSnapshot.forEach((snapshot, instanceId) => {
    if (instanceId === selectedEditorObject.userData.instanceId) return;
    const object = placedObjects.find((candidate) => candidate.userData.instanceId === instanceId);
    if (!object) return;
    object.position.copy(snapshot.position.clone().add(deltaPosition));
    object.quaternion.copy(deltaQuaternion.clone().multiply(snapshot.quaternion));
    object.scale.copy(snapshot.scale.clone().multiply(deltaScale));
  });
}

transformControls.addEventListener('objectChange', () => {
  applyMultiTransformDelta();
  updateInspectorFromSelection();
});

const isometricCameraPosition = new THREE.Vector3(11, 13, 11);
const topCameraPosition = new THREE.Vector3(0.001, 30, 0.001);
let editorView = 'isometric';

function applyEditorView(view) {
  editorView = view;
  $$('.tool-button[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  if (view === 'top') {
    camera.position.copy(topCameraPosition);
    orbitControls.target.set(0, 0, 0);
    orbitControls.enableRotate = false;
  } else {
    camera.position.copy(isometricCameraPosition);
    orbitControls.target.set(0, 0.8, 0);
    orbitControls.enableRotate = true;
  }
  orbitControls.update();
  updateCameraProjection();
}

const previewRenderer = new THREE.WebGLRenderer({
  canvas: assetPreviewCanvas,
  antialias: true,
  alpha: true,
});
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

const previewScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const previewGroup = new THREE.Group();
previewScene.add(previewGroup);
previewScene.add(new THREE.HemisphereLight('#c9dcff', '#172033', 2.4));
const previewLight = new THREE.DirectionalLight('#fff4df', 3);
previewLight.position.set(4, 6, 4);
previewScene.add(previewLight);

let previewToken = 0;

function updatePreviewProjection() {
  const width = assetPreviewCanvas.clientWidth;
  const height = assetPreviewCanvas.clientHeight;
  if (!width || !height) return;
  previewRenderer.setSize(width, height, false);
  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();
}

new ResizeObserver(updatePreviewProjection).observe(assetPreviewCanvas);

function frameObjectForCamera(object, targetCamera) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const distance = maxDimension * 1.8;
  targetCamera.position.set(distance, distance * 0.75, distance);
  targetCamera.near = Math.max(distance / 100, 0.01);
  targetCamera.far = distance * 10;
  targetCamera.updateProjectionMatrix();
  targetCamera.lookAt(0, 0, 0);
}

async function loadAssetPreview(asset) {
  const token = ++previewToken;
  previewGroup.clear();
  if (!asset) return;

  try {
    const template = await loadAssetTemplate(asset);
    if (token !== previewToken) return;
    const content = template.clone(true);
    cloneMaterials(content);
    previewGroup.add(content);
    frameObjectForCamera(content, previewCamera);
  } catch (error) {
    console.error(error);
  }
}

let selectedAssetFile = '';

function updateAssetPreviewFromSelect() {
  const asset = assetCatalog.find((item) => item.file === selectedAssetFile);
  loadAssetPreview(asset);
}

const thumbnailCanvasSize = 96;
const thumbnailRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
thumbnailRenderer.setSize(thumbnailCanvasSize, thumbnailCanvasSize, false);
thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;

const thumbnailScene = new THREE.Scene();
const thumbnailCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const thumbnailGroup = new THREE.Group();
thumbnailScene.add(thumbnailGroup);
thumbnailScene.add(new THREE.HemisphereLight('#c9dcff', '#172033', 2.4));
const thumbnailLight = new THREE.DirectionalLight('#fff4df', 3);
thumbnailLight.position.set(4, 6, 4);
thumbnailScene.add(thumbnailLight);

const thumbnailCache = new Map();

function drawThumbnail(dataUrl, targetCanvas) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;
  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(image, 0, 0, targetCanvas.width, targetCanvas.height);
  };
  image.src = dataUrl;
}

async function renderThumbnail(asset, targetCanvas) {
  const cached = thumbnailCache.get(asset.file);
  if (cached) {
    drawThumbnail(cached, targetCanvas);
    return;
  }

  try {
    const template = await loadAssetTemplate(asset);
    thumbnailGroup.clear();
    const content = template.clone(true);
    cloneMaterials(content);
    thumbnailGroup.add(content);
    frameObjectForCamera(content, thumbnailCamera);
    thumbnailRenderer.render(thumbnailScene, thumbnailCamera);
    const dataUrl = thumbnailRenderer.domElement.toDataURL('image/png');
    thumbnailCache.set(asset.file, dataUrl);
    drawThumbnail(dataUrl, targetCanvas);
  } catch (error) {
    console.error(error);
  }
}

const thumbnailObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const targetCanvas = entry.target;
      thumbnailObserver.unobserve(targetCanvas);
      const asset = assetCatalog.find((item) => item.file === targetCanvas.dataset.file);
      if (asset) renderThumbnail(asset, targetCanvas);
    });
  },
  { root: assetSelect, threshold: 0.1 },
);

function selectAssetCard(file) {
  selectedAssetFile = file;
  assetSelect.querySelectorAll('.asset-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.file === file);
  });
  updateAssetPreviewFromSelect();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const destination = new THREE.Vector3();
const movementDirection = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const keyboardDirection = new THREE.Vector3();
const pressedKeys = new Set();
const assetCache = new Map();
const placedObjects = [];

let currentMode = 'editor';
let mixer = null;
let squidMeshes = [];
let loadedModel = null;
let isMoving = false;
let characterSpeed = 2.8;
let editorLayoutBounds = null;
let assetCatalog = [];
let filteredAssets = [];
let selectedEditorObject = null;
let multiSelection = new Set();
let rooms = [];
let nextRoomInstanceId = 1;
let currentRoomInstanceId = null;
let nextInstanceId = 1;
const modelHeadingCorrection = THREE.MathUtils.degToRad(-17);
const legacyLayoutStorageKey = 'escape-room-editor-layout-v1';
const layoutStorageKey =
  mapId && mapId !== 'default'
    ? `${legacyLayoutStorageKey}:${mapId}`
    : legacyLayoutStorageKey;

function updateCameraProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  const viewHeight = currentMode === 'editor' ? 16 : 10;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.near = 0.01;
  camera.far = 200;
  camera.updateProjectionMatrix();
}

function setPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function updateQuarterView(delta) {
  if (currentMode !== 'movement') return;
  cameraTarget.copy(character.position).add(cameraOffset);
  const cameraLerp = 1 - Math.exp(-5 * delta);
  camera.position.lerp(cameraTarget, cameraLerp);
  camera.lookAt(
    character.position.x,
    character.position.y + 0.65,
    character.position.z,
  );
}

function centerSelectedSquid(selected) {
  if (!selected || !loadedModel) return;
  loadedModel.position.set(0, 0, 0);
  loadedModel.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(selected);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const localCenter = character.worldToLocal(center.clone());

  loadedModel.position.x -= localCenter.x;
  loadedModel.position.z -= localCenter.z;
  loadedModel.position.y -= localCenter.y - size.y / 2;

  const largestDimension = Math.max(size.x, size.y, size.z);
  if (largestDimension > 0) character.scale.setScalar(1.35 / largestDimension);
  loadedModel.updateMatrixWorld(true);
}

function showSquid(index) {
  const selected = squidMeshes[index];
  if (!selected) return;
  squidMeshes.forEach((mesh) => {
    mesh.visible = mesh === selected;
  });
  centerSelectedSquid(selected);
}

function computeEditorLayoutBounds() {
  if (placedObjects.length === 0) return null;
  const box = new THREE.Box3();
  placedObjects.forEach((object) => box.expandByObject(object));
  return {
    min: new THREE.Vector3(box.min.x - 1, 0, box.min.z - 1),
    max: new THREE.Vector3(box.max.x + 1, 0, box.max.z + 1),
  };
}

function isInsideActiveMap(position) {
  if (!editorLayoutBounds) return false;
  return (
    position.x >= editorLayoutBounds.min.x &&
    position.x <= editorLayoutBounds.max.x &&
    position.z >= editorLayoutBounds.min.z &&
    position.z <= editorLayoutBounds.max.z
  );
}

function setDestination(event) {
  if (currentMode !== 'movement') return;
  setPointer(event);

  const hit = raycaster.intersectObject(navigationSurface, false)[0];
  if (!hit || !isInsideActiveMap(hit.point)) return;

  destination.copy(hit.point);
  destination.y = 0;
  destinationMarker.position.x = destination.x;
  destinationMarker.position.z = destination.z;
  destinationMarker.visible = true;
  isMoving = true;
}

function rotateTowardsMovement(delta) {
  const targetRotation =
    Math.atan2(movementDirection.x, movementDirection.z) +
    modelHeadingCorrection;
  const rotationDifference = Math.atan2(
    Math.sin(targetRotation - character.rotation.y),
    Math.cos(targetRotation - character.rotation.y),
  );
  character.rotation.y += rotationDifference * Math.min(1, delta * 10);
}

function updateKeyboardMovement(delta) {
  if (currentMode !== 'movement') return false;
  const horizontal =
    Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
  const vertical =
    Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
  if (horizontal === 0 && vertical === 0) return false;

  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  cameraForward.normalize();
  cameraRight.crossVectors(cameraForward, camera.up).normalize();
  keyboardDirection
    .set(0, 0, 0)
    .addScaledVector(cameraForward, vertical)
    .addScaledVector(cameraRight, horizontal)
    .normalize();

  movementDirection.copy(keyboardDirection);
  const previousPosition = character.position.clone();
  character.position.addScaledVector(movementDirection, characterSpeed * delta);
  if (!isInsideActiveMap(character.position)) {
    character.position.copy(previousPosition);
  }

  rotateTowardsMovement(delta);
  isMoving = false;
  destinationMarker.visible = false;
  return true;
}

const editorCameraSpeed = 10;
const editorCameraForward = new THREE.Vector3();
const editorCameraRight = new THREE.Vector3();
const editorCameraOffset = new THREE.Vector3();

function updateEditorCameraMovement(delta) {
  if (currentMode !== 'editor') return;
  const horizontal =
    Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
  const vertical =
    Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
  if (horizontal === 0 && vertical === 0) return;

  camera.getWorldDirection(editorCameraForward);
  editorCameraForward.y = 0;
  if (editorCameraForward.lengthSq() < 1e-6) editorCameraForward.set(0, 0, -1);
  editorCameraForward.normalize();
  editorCameraRight.crossVectors(editorCameraForward, camera.up).normalize();

  editorCameraOffset
    .set(0, 0, 0)
    .addScaledVector(editorCameraForward, vertical)
    .addScaledVector(editorCameraRight, horizontal)
    .normalize()
    .multiplyScalar(editorCameraSpeed * delta);

  camera.position.add(editorCameraOffset);
  orbitControls.target.add(editorCameraOffset);
}

function updateMovement(delta) {
  if (updateKeyboardMovement(delta) || !isMoving) return;
  movementDirection.subVectors(destination, character.position);
  movementDirection.y = 0;
  const remainingDistance = movementDirection.length();

  if (remainingDistance < 0.04) {
    character.position.copy(destination);
    isMoving = false;
    destinationMarker.visible = false;
    return;
  }

  movementDirection.normalize();
  character.position.addScaledVector(
    movementDirection,
    Math.min(characterSpeed * delta, remainingDistance),
  );
  rotateTowardsMovement(delta);
}

function resetCharacterMovement() {
  character.position.set(0, 0, 0);
  isMoving = false;
  pressedKeys.clear();
  destinationMarker.visible = false;
}

function cloneMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material?.clone();
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

async function loadAssetTemplate(asset) {
  if (!assetCache.has(asset.file)) {
    const promise = new Promise((resolve, reject) => {
      loader.load(asset.url, (gltf) => resolve(gltf.scene), undefined, reject);
    });
    assetCache.set(asset.file, promise);
  }
  return assetCache.get(asset.file);
}

function normalizeAsset(root) {
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

function ensureDefaultRoom() {
  if (rooms.length > 0) return;
  const room = { instanceId: nextRoomInstanceId++, name: '방1', isStartRoom: true };
  rooms.push(room);
  currentRoomInstanceId = room.instanceId;
}

function addRoom() {
  const room = {
    instanceId: nextRoomInstanceId++,
    name: `방${rooms.length + 1}`,
    isStartRoom: rooms.length === 0,
  };
  rooms.push(room);
  currentRoomInstanceId = room.instanceId;
  syncHierarchy();
  saveLayout();
}

function deleteRoom(room) {
  if (rooms.length <= 1) {
    editorStatus.textContent = '최소 하나의 방은 있어야 합니다.';
    return;
  }

  const targets = placedObjects.filter((object) => object.userData.roomInstanceId === room.instanceId);
  const confirmed = window.confirm(
    `"${room.name}" 방을 삭제합니다. 방 안의 오브젝트 ${targets.length}개가 함께 삭제되며 되돌릴 수 없습니다. 계속할까요?`,
  );
  if (!confirmed) return;

  targets.forEach((object) => {
    const index = placedObjects.indexOf(object);
    if (index >= 0) placedObjects.splice(index, 1);
    object.removeFromParent();
    multiSelection.delete(object.userData.instanceId);
  });
  if (selectedEditorObject && !placedObjects.includes(selectedEditorObject)) {
    selectedEditorObject = null;
    transformControls.detach();
  }

  rooms = rooms.filter((candidate) => candidate.instanceId !== room.instanceId);
  if (rooms.length && !rooms.some((candidate) => candidate.isStartRoom)) rooms[0].isStartRoom = true;
  if (currentRoomInstanceId === room.instanceId) currentRoomInstanceId = rooms[0]?.instanceId ?? null;

  updateInspectorFromSelection();
  syncHierarchy();
  saveLayout();
  editorStatus.textContent = `"${room.name}" 방과 오브젝트 ${targets.length}개를 삭제했습니다.`;
}

function createPlacedContainer(asset, content) {
  const container = new THREE.Group();
  container.name = `${asset.label} ${nextInstanceId}`;
  container.userData.editorAsset = true;
  container.userData.assetFile = asset.file;
  container.userData.assetUrl = asset.url;
  container.userData.assetLabel = asset.label;
  container.userData.instanceId = nextInstanceId++;
  container.add(content);
  return container;
}

async function addAsset(asset, transform = null, shouldSave = true) {
  if (!asset) return null;
  editorStatus.textContent = `${asset.label} 불러오는 중...`;
  addAssetButton.disabled = true;

  try {
    const template = await loadAssetTemplate(asset);
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
    container.userData.roomInstanceId = transform?.roomInstanceId ?? currentRoomInstanceId;

    editorRoot.add(container);
    placedObjects.push(container);
    selectEditorObject(container);
    syncHierarchy();
    if (shouldSave) saveLayout();
    editorStatus.textContent = `${asset.label}을 배치했습니다.`;
    return container;
  } catch (error) {
    console.error(error);
    editorStatus.textContent = `${asset.label}을 불러오지 못했습니다.`;
    return null;
  } finally {
    addAssetButton.disabled = assetCatalog.length === 0;
  }
}

function setSharedNumberField(input, values, precision) {
  const rounded = values.map((value) => Number(value.toFixed(precision)));
  const allEqual = rounded.every((value) => value === rounded[0]);
  input.value = allEqual ? rounded[0].toFixed(precision) : '';
}

function updateInspectorFromSelection() {
  const count = multiSelection.size;
  duplicateButton.disabled = count !== 1;
  deleteButton.disabled = count === 0;

  inspectorBody.hidden = count === 0;
  inspectorEmpty.hidden = count > 0;
  if (count === 0) return;

  const selected = placedObjects.filter((object) => multiSelection.has(object.userData.instanceId));

  setSharedNumberField(inspectorPosX, selected.map((object) => object.position.x), 2);
  setSharedNumberField(inspectorPosY, selected.map((object) => object.position.y), 2);
  setSharedNumberField(inspectorPosZ, selected.map((object) => object.position.z), 2);
  setSharedNumberField(
    inspectorRotX,
    selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.x)),
    1,
  );
  setSharedNumberField(
    inspectorRotY,
    selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.y)),
    1,
  );
  setSharedNumberField(
    inspectorRotZ,
    selected.map((object) => THREE.MathUtils.radToDeg(object.rotation.z)),
    1,
  );
  setSharedNumberField(inspectorScaleX, selected.map((object) => object.scale.x), 2);
  setSharedNumberField(inspectorScaleY, selected.map((object) => object.scale.y), 2);
  setSharedNumberField(inspectorScaleZ, selected.map((object) => object.scale.z), 2);

  inspectorBgImage.value = '';
  const bgImageUrl = count === 1 ? selectedEditorObject.userData.bgImageUrl || '' : '';
  inspectorBgPreview.hidden = !bgImageUrl;
  inspectorBgPreview.src = bgImageUrl;
}

function selectEditorObject(object, options = {}) {
  const { additive = false, range = false } = options;

  if (!object) {
    multiSelection.clear();
    selectedEditorObject = null;
  } else if (range && selectedEditorObject) {
    const startIndex = placedObjects.indexOf(selectedEditorObject);
    const endIndex = placedObjects.indexOf(object);
    if (startIndex >= 0 && endIndex >= 0) {
      const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      for (let i = from; i <= to; i += 1) multiSelection.add(placedObjects[i].userData.instanceId);
    }
    selectedEditorObject = object;
  } else if (additive) {
    if (multiSelection.has(object.userData.instanceId)) {
      multiSelection.delete(object.userData.instanceId);
      selectedEditorObject =
        placedObjects.find((candidate) => multiSelection.has(candidate.userData.instanceId)) ||
        null;
    } else {
      multiSelection.add(object.userData.instanceId);
      selectedEditorObject = object;
    }
  } else {
    multiSelection.clear();
    multiSelection.add(object.userData.instanceId);
    selectedEditorObject = object;
  }

  if (selectedEditorObject) {
    transformControls.attach(selectedEditorObject);
    currentRoomInstanceId = selectedEditorObject.userData.roomInstanceId;
  } else {
    transformControls.detach();
  }
  updateInspectorFromSelection();
  syncHierarchyHighlight();
}

function selectRoom(room) {
  multiSelection.clear();
  selectedEditorObject = null;
  transformControls.detach();
  currentRoomInstanceId = room.instanceId;
  updateInspectorFromSelection();
  syncHierarchyHighlight();
}

function findPlacedAncestor(object) {
  let current = object;
  while (current && current !== editorRoot) {
    if (current.userData.editorAsset) return current;
    current = current.parent;
  }
  return null;
}

function selectFromCanvas(event) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }
  if (
    currentMode !== 'editor' ||
    transformControls.dragging ||
    sidebarLeft.contains(event.target) ||
    sidebarRight.contains(event.target)
  ) {
    return;
  }
  setPointer(event);
  const hits = raycaster.intersectObjects(placedObjects, true);
  const object = hits.length ? findPlacedAncestor(hits[0].object) : null;
  if (object && event.shiftKey) selectEditorObject(object, { range: true });
  else if (object && (event.ctrlKey || event.metaKey)) selectEditorObject(object, { additive: true });
  else selectEditorObject(object);
}

function syncHierarchyHighlight() {
  hierarchyList.querySelectorAll('.hierarchy-object').forEach((item) => {
    item.classList.toggle('is-selected', multiSelection.has(Number(item.dataset.instanceId)));
  });
  hierarchyList.querySelectorAll('.hierarchy-room-header').forEach((header) => {
    header.classList.toggle(
      'is-current-room',
      Number(header.dataset.roomInstanceId) === currentRoomInstanceId,
    );
  });
}

function syncHierarchy() {
  hierarchyList.innerHTML = '';

  rooms.forEach((room) => {
    const header = document.createElement('li');
    header.className = 'hierarchy-room-header';
    header.dataset.roomInstanceId = String(room.instanceId);
    header.classList.toggle('is-current-room', room.instanceId === currentRoomInstanceId);

    const headerLabel = document.createElement('span');
    headerLabel.className = 'hierarchy-room-header-label';
    headerLabel.textContent = room.name;
    header.append(headerLabel);

    const deleteRoomButton = document.createElement('button');
    deleteRoomButton.type = 'button';
    deleteRoomButton.className = 'hierarchy-room-delete';
    deleteRoomButton.textContent = '×';
    deleteRoomButton.setAttribute('aria-label', `${room.name} 삭제`);
    deleteRoomButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteRoom(room);
    });
    header.append(deleteRoomButton);

    header.addEventListener('click', () => selectRoom(room));
    hierarchyList.append(header);

    placedObjects
      .filter((object) => object.userData.roomInstanceId === room.instanceId)
      .forEach((object) => {
        const item = document.createElement('li');
        item.className = 'hierarchy-object';
        item.dataset.instanceId = String(object.userData.instanceId);
        item.textContent = object.name;
        item.classList.toggle('is-selected', multiSelection.has(object.userData.instanceId));
        item.addEventListener('click', (event) => {
          if (event.shiftKey) {
            selectEditorObject(object, { range: true });
          } else if (event.ctrlKey || event.metaKey) {
            selectEditorObject(object, { additive: true });
          } else if (
            multiSelection.size === 1 &&
            object.userData.instanceId === selectedEditorObject?.userData.instanceId
          ) {
            startRenameHierarchyItem(item, object);
          } else {
            selectEditorObject(object);
          }
        });
        hierarchyList.append(item);
      });
  });

  const addRoomItem = document.createElement('li');
  addRoomItem.className = 'hierarchy-add-room';
  const addRoomButton = document.createElement('button');
  addRoomButton.type = 'button';
  addRoomButton.className = 'hierarchy-add-room-button';
  addRoomButton.textContent = '+';
  addRoomButton.setAttribute('aria-label', '방 추가');
  addRoomButton.addEventListener('click', addRoom);
  addRoomItem.append(addRoomButton);
  hierarchyList.append(addRoomItem);
}

function startRenameHierarchyItem(item, object) {
  if (item.querySelector('input')) return;
  item.textContent = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = object.name;
  item.append(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextName = input.value.trim();
    if (nextName) object.name = nextName;
    syncHierarchy();
    saveLayout();
  };

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.code === 'Enter') input.blur();
    if (event.code === 'Escape') {
      input.removeEventListener('blur', commit);
      syncHierarchy();
    }
  });
  input.addEventListener('blur', commit, { once: true });
}

function renameSelectedObject() {
  if (!selectedEditorObject || multiSelection.size !== 1) return;
  const item = hierarchyList.querySelector(
    `li[data-instance-id="${selectedEditorObject.userData.instanceId}"]`,
  );
  if (item) startRenameHierarchyItem(item, selectedEditorObject);
}

function removeSelectedObjects(shouldSave = true) {
  if (multiSelection.size === 0) return;
  const targets = placedObjects.filter((object) => multiSelection.has(object.userData.instanceId));
  targets.forEach((object) => {
    const index = placedObjects.indexOf(object);
    if (index >= 0) placedObjects.splice(index, 1);
    object.removeFromParent();
  });
  selectEditorObject(null);
  syncHierarchy();
  if (shouldSave) saveLayout();
  editorStatus.textContent = `선택한 객체 ${targets.length}개를 삭제했습니다.`;
}

async function duplicateSelectedObject() {
  if (!selectedEditorObject || multiSelection.size !== 1) return;
  const asset = assetCatalog.find(
    (candidate) => candidate.file === selectedEditorObject.userData.assetFile,
  );
  if (!asset) return;
  const transform = {
    position: selectedEditorObject.position
      .clone()
      .add(new THREE.Vector3(0.5, 0, 0.5))
      .toArray(),
    rotation: selectedEditorObject.rotation.toArray(),
    scale: selectedEditorObject.scale.toArray(),
    roomInstanceId: selectedEditorObject.userData.roomInstanceId,
  };
  await addAsset(asset, transform);
}

function serializeLayout() {
  return {
    rooms: rooms.map((room) => ({
      id: `room-${room.instanceId}`,
      roomName: room.name,
      isStartRoom: room.isStartRoom,
      initialSpawnPos: [0, 0, 0],
      connectedRooms: [],
      objects: placedObjects
        .filter((object) => object.userData.roomInstanceId === room.instanceId)
        .map((object) => ({
          id: `obj-${object.userData.instanceId}`,
          name: object.name,
          glbUrl: object.userData.assetUrl,
          transform: {
            position: object.position.toArray(),
            rotation: object.rotation.toArray(),
            scale: object.scale.toArray(),
          },
          castShadow: true,
          receiveShadow: true,
          blocksMovement: true,
          interaction: null,
        })),
    })),
  };
}

function saveLayout() {
  localStorage.setItem(layoutStorageKey, JSON.stringify(serializeLayout()));
}

function isLegacyFlatLayout(saved) {
  return Array.isArray(saved) && saved.length > 0 && typeof saved[0].file === 'string';
}

function collectRestoreItems(saved) {
  if (isLegacyFlatLayout(saved)) {
    ensureDefaultRoom();
    return saved.map((item) => ({
      asset: assetCatalog.find((candidate) => candidate.file === item.file),
      name: item.name,
      position: item.position,
      rotation: item.rotation,
      scale: item.scale,
      roomInstanceId: currentRoomInstanceId,
    }));
  }

  const savedRooms = Array.isArray(saved) ? saved : saved.rooms || [];
  const items = [];
  rooms = savedRooms.map((savedRoom, index) => {
    const room = {
      instanceId: nextRoomInstanceId++,
      name: savedRoom.roomName || `방${index + 1}`,
      isStartRoom: Boolean(savedRoom.isStartRoom),
    };
    (savedRoom.objects || []).forEach((item) => {
      items.push({
        asset: assetCatalog.find((candidate) => candidate.url === item.glbUrl),
        name: item.name,
        position: item.transform.position,
        rotation: item.transform.rotation,
        scale: item.transform.scale,
        roomInstanceId: room.instanceId,
      });
    });
    return room;
  });
  ensureDefaultRoom();
  currentRoomInstanceId = rooms[0].instanceId;
  return items;
}

async function restoreLayout() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(layoutStorageKey) || '[]');
  } catch {
    saved = [];
  }
  const hasData = Array.isArray(saved) ? saved.length > 0 : Boolean(saved?.rooms?.length);
  if (!hasData) {
    ensureDefaultRoom();
    syncHierarchy();
    return;
  }

  const items = collectRestoreItems(saved);
  editorStatus.textContent = `저장된 객체 ${items.length}개를 복원하는 중...`;
  for (const item of items) {
    if (item.asset) await addAsset(item.asset, item, false);
  }
  selectEditorObject(null);
  syncHierarchy();
  editorStatus.textContent = `저장된 객체 ${placedObjects.length}개를 복원했습니다.`;
}

function labelFromFilename(file) {
  return file
    .replace(/\.glb$/i, '')
    .replace(/__/g, ' / ')
    .replace(/[-_]/g, ' ');
}

function renderAssetOptions() {
  const query = assetSearch.value.trim().toLowerCase();
  filteredAssets = assetCatalog.filter((asset) =>
    `${asset.label} ${asset.collection}`.toLowerCase().includes(query),
  );
  assetSelect.innerHTML = '';
  filteredAssets.forEach((asset) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'asset-card';
    card.dataset.file = asset.file;
    card.setAttribute('role', 'option');

    const thumb = document.createElement('span');
    thumb.className = 'asset-card-thumb';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbnailCanvasSize;
    thumbCanvas.height = thumbnailCanvasSize;
    thumbCanvas.dataset.file = asset.file;
    thumb.append(thumbCanvas);

    const label = document.createElement('span');
    label.className = 'asset-card-label';
    label.textContent = asset.label;

    card.append(thumb, label);
    card.addEventListener('click', () => selectAssetCard(asset.file));
    card.addEventListener('dblclick', () => addAsset(asset));
    assetSelect.append(card);

    thumbnailObserver.observe(thumbCanvas);
  });

  addAssetButton.disabled = filteredAssets.length === 0;
  selectAssetCard(filteredAssets.length ? filteredAssets[0].file : '');
}

async function fetchAssetCatalog() {
  const sources = [
    '/models/assets/manifest.json',
    '/models/assets/asset-index.json',
  ];

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      const records = Array.isArray(data.assets)
        ? data.assets
        : (data.files || []).map((file) => ({ file }));
      if (!records.length) continue;

      assetCatalog = records.map((record) => ({
        file: record.file,
        label: record.root || labelFromFilename(record.file),
        collection: record.collection || '',
        url: `/models/assets/${encodeURIComponent(record.file)}`,
      }));
      assetCatalog.sort((left, right) =>
        left.label.localeCompare(right.label, 'ko', { numeric: true }),
      );
      assetCount.textContent = `${assetCatalog.length} assets`;
      renderAssetOptions();
      editorStatus.textContent = `${assetCatalog.length}개 에셋을 사용할 수 있습니다.`;
      await restoreLayout();
      return;
    } catch (error) {
      console.warn(`Asset catalog unavailable: ${source}`, error);
    }
  }

  assetCatalog = [];
  assetCount.textContent = '0 assets';
  addAssetButton.disabled = true;
  editorStatus.textContent =
    'public/models/assets에 GLB를 넣고 npm run assets:index를 실행해 주세요.';
}

function setTransformMode(mode) {
  transformControls.setMode(mode);
  $$('.tool-button[data-transform]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transform === mode);
  });
}

function setMode(mode) {
  currentMode = mode;
  document.body.dataset.mode = mode;
  const isEditor = mode === 'editor';

  $$('.mode-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  sidebarLeft.hidden = !isEditor;
  sidebarRight.hidden = !isEditor;
  editorHint.hidden = !isEditor;
  character.visible = !isEditor;
  destinationMarker.visible = !isEditor && isMoving;
  orbitControls.enabled = isEditor;
  transformControls.enabled = isEditor;
  transformControls.getHelper().visible = isEditor && Boolean(selectedEditorObject);

  floor.visible = isEditor;
  grid.visible = isEditor;

  pressedKeys.clear();
  if (isEditor) {
    applyEditorView(editorView);
  } else {
    resetCharacterMovement();
    editorLayoutBounds = computeEditorLayoutBounds();
    if (editorLayoutBounds) {
      character.position.set(
        (editorLayoutBounds.min.x + editorLayoutBounds.max.x) / 2,
        0,
        (editorLayoutBounds.min.z + editorLayoutBounds.max.z) / 2,
      );
    }
    camera.position.copy(character.position).add(cameraOffset);
    camera.lookAt(character.position.x, character.position.y + 0.65, character.position.z);
  }
  updateCameraProjection();
}

loader.load(
  '/models/quirky_series_-_free_animals_pack.glb',
  (gltf) => {
    loadedModel = gltf.scene;
    loadedModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const isSquid = materials.some(
        (material) => material?.name === 'M_Inkfish',
      );
      child.visible = isSquid;
      if (isSquid) squidMeshes.push(child);
    });
    character.add(loadedModel);

    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(loadedModel);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    if (squidMeshes.length) showSquid(0);
  },
  undefined,
  (error) => {
    console.error(error);
  },
);

$$('.mode-button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

$$('.tool-button[data-transform]').forEach((button) => {
  button.addEventListener('click', () =>
    setTransformMode(button.dataset.transform),
  );
});

$$('.tool-button[data-view]').forEach((button) => {
  button.addEventListener('click', () => applyEditorView(button.dataset.view));
});

assetSearch.addEventListener('input', renderAssetOptions);
addAssetButton.addEventListener('click', () => {
  const asset = assetCatalog.find((item) => item.file === selectedAssetFile);
  addAsset(asset);
});

sidebarLeftToggle.addEventListener('click', () => {
  const collapsed = sidebarLeft.dataset.collapsed === 'true';
  sidebarLeft.dataset.collapsed = String(!collapsed);
});

sidebarRightToggle.addEventListener('click', () => {
  const collapsed = sidebarRight.dataset.collapsed === 'true';
  sidebarRight.dataset.collapsed = String(!collapsed);
  document.body.classList.toggle('sidebar-right-collapsed', !collapsed);
});

function applyInspectorVector(component, axis, value) {
  if (multiSelection.size === 0) return;
  const trimmed = value.trim();
  if (trimmed === '') return;
  const number = Number(trimmed);
  if (Number.isNaN(number)) return;

  placedObjects
    .filter((object) => multiSelection.has(object.userData.instanceId))
    .forEach((object) => {
      if (component === 'rotation') {
        object.rotation[axis] = THREE.MathUtils.degToRad(number);
      } else {
        object[component][axis] = number;
      }
    });
  saveLayout();
}

inspectorPosX.addEventListener('input', (event) => applyInspectorVector('position', 'x', event.target.value));
inspectorPosY.addEventListener('input', (event) => applyInspectorVector('position', 'y', event.target.value));
inspectorPosZ.addEventListener('input', (event) => applyInspectorVector('position', 'z', event.target.value));
inspectorRotX.addEventListener('input', (event) => applyInspectorVector('rotation', 'x', event.target.value));
inspectorRotY.addEventListener('input', (event) => applyInspectorVector('rotation', 'y', event.target.value));
inspectorRotZ.addEventListener('input', (event) => applyInspectorVector('rotation', 'z', event.target.value));
inspectorScaleX.addEventListener('input', (event) => applyInspectorVector('scale', 'x', event.target.value));
inspectorScaleY.addEventListener('input', (event) => applyInspectorVector('scale', 'y', event.target.value));
inspectorScaleZ.addEventListener('input', (event) => applyInspectorVector('scale', 'z', event.target.value));

inspectorBgImage.addEventListener('change', () => {
  if (!selectedEditorObject) return;
  const file = inspectorBgImage.files[0];
  if (!file) return;

  const previousUrl = selectedEditorObject.userData.bgImageUrl;
  if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);

  const objectUrl = URL.createObjectURL(file);
  selectedEditorObject.userData.bgImageUrl = objectUrl;
  inspectorBgPreview.hidden = false;
  inspectorBgPreview.src = objectUrl;
});

deleteButton.addEventListener('click', () => removeSelectedObjects());
duplicateButton.addEventListener('click', duplicateSelectedObject);

canvas.addEventListener('pointerdown', setDestination);
canvas.addEventListener('click', selectFromCanvas);

window.addEventListener('keydown', (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement
  ) {
    return;
  }

  if (currentMode === 'editor') {
    if (event.code === 'KeyQ') setTransformMode('translate');
    if (event.code === 'KeyE') setTransformMode('rotate');
    if (event.code === 'KeyR') setTransformMode('scale');
    if (event.code === 'Delete') removeSelectedObjects();
    if (event.code === 'F2') {
      event.preventDefault();
      renameSelectedObject();
    }
  }

  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  event.preventDefault();
  pressedKeys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  pressedKeys.delete(event.code);
});

window.addEventListener('blur', () => pressedKeys.clear());
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraProjection();
});

setMode('editor');
fetchAssetCatalog();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  mixer?.update(delta);
  updateMovement(delta);
  updateQuarterView(delta);
  updateEditorCameraMovement(delta);
  if (currentMode === 'editor') orbitControls.update();

  destinationMarker.material.opacity =
    0.55 + Math.sin(clock.elapsedTime * 5) * 0.25;
  renderer.render(scene, camera);

  if (currentMode === 'editor' && previewGroup.children.length) {
    previewGroup.rotation.y += delta * 0.6;
    previewRenderer.render(previewScene, previewCamera);
  }
}

animate();

  return undefined;
}
