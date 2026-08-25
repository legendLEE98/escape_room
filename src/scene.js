import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

export function createScene(canvas) {
const movementPanel = $('.movement-panel');
const editorPanel = $('.editor-panel');
const editorHint = $('.editor-hint');
const movementStatus = $('#movement-status');
const editorStatus = $('#editor-status');
const animationSelect = $('#animation');
const mapSelect = $('#map');
const assetSearch = $('#asset-search');
const assetSelect = $('#asset-select');
const assetCount = $('#asset-count');
const addAssetButton = $('#add-asset');
const placedSelect = $('#placed-select');

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
editorRoot.visible = false;
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

transformControls.addEventListener('dragging-changed', (event) => {
  orbitControls.enabled = !event.value && currentMode === 'editor';
  if (!event.value) saveLayout();
});

transformControls.addEventListener('objectChange', () => {
  syncPlacedList();
});

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

let currentMode = 'movement';
let mixer = null;
let squidMeshes = [];
let loadedModel = null;
let isMoving = false;
let characterSpeed = 2.8;
let activeMap = 'current';
let officeMap = null;
let officeMapPromise = null;
let officeBounds = null;
let assetCatalog = [];
let filteredAssets = [];
let selectedEditorObject = null;
let nextInstanceId = 1;
const modelHeadingCorrection = THREE.MathUtils.degToRad(-17);
const layoutStorageKey = 'escape-room-editor-layout-v1';

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

function isInsideActiveMap(position) {
  if (activeMap === 'office' && officeBounds) {
    return (
      position.x >= officeBounds.min.x &&
      position.x <= officeBounds.max.x &&
      position.z >= officeBounds.min.z &&
      position.z <= officeBounds.max.z
    );
  }
  return Math.hypot(position.x, position.z) <= 17.5;
}

function setDestination(event) {
  if (currentMode !== 'movement' || movementPanel.contains(event.target)) return;
  setPointer(event);

  const hit = raycaster.intersectObject(navigationSurface, false)[0];
  if (!hit) return;
  if (!isInsideActiveMap(hit.point)) {
    movementStatus.textContent = '이동 가능한 공간 안쪽을 선택해 주세요.';
    return;
  }

  destination.copy(hit.point);
  destination.y = 0;
  destinationMarker.position.x = destination.x;
  destinationMarker.position.z = destination.z;
  destinationMarker.visible = true;
  isMoving = true;
  movementStatus.textContent = '목표 지점으로 이동 중입니다.';
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
  movementStatus.textContent = 'WASD로 이동 중입니다.';
  return true;
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
    movementStatus.textContent = '도착했습니다. 바닥을 클릭해 이동하세요.';
    return;
  }

  movementDirection.normalize();
  character.position.addScaledVector(
    movementDirection,
    Math.min(characterSpeed * delta, remainingDistance),
  );
  rotateTowardsMovement(delta);
}

function prepareOfficeMap(gltf) {
  const map = gltf.scene;
  map.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });

  map.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(map);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const horizontalSize = Math.max(initialSize.x, initialSize.z);
  const scale = horizontalSize > 0 ? 14 / horizontalSize : 1;
  map.scale.setScalar(scale);
  map.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(map);
  const center = scaledBox.getCenter(new THREE.Vector3());
  map.position.x -= center.x;
  map.position.z -= center.z;
  map.position.y -= scaledBox.min.y;
  map.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(map);
  officeBounds = {
    min: new THREE.Vector3(finalBox.min.x + 0.35, 0, finalBox.min.z + 0.35),
    max: new THREE.Vector3(finalBox.max.x - 0.35, 0, finalBox.max.z - 0.35),
  };

  map.visible = false;
  scene.add(map);
  officeMap = map;
  return map;
}

function loadOfficeMap() {
  if (officeMap) return Promise.resolve(officeMap);
  if (officeMapPromise) return officeMapPromise;

  officeMapPromise = new Promise((resolve, reject) => {
    loader.load(
      '/models/isometric_office.glb',
      (gltf) => resolve(prepareOfficeMap(gltf)),
      undefined,
      reject,
    );
  });
  return officeMapPromise;
}

function resetCharacterMovement() {
  character.position.set(0, 0, 0);
  isMoving = false;
  pressedKeys.clear();
  destinationMarker.visible = false;
}

async function changeMap(nextMap) {
  mapSelect.disabled = true;
  resetCharacterMovement();

  try {
    if (nextMap === 'office') {
      movementStatus.textContent = officeMap
        ? '사무실 맵으로 전환 중입니다.'
        : '통합 사무실 맵을 불러오는 중입니다.';
      await loadOfficeMap();
      activeMap = 'office';
      floor.visible = false;
      grid.visible = false;
      officeMap.visible = currentMode === 'movement';
      movementStatus.textContent =
        '사무실 맵입니다. 바닥 클릭 또는 WASD로 이동하세요.';
    } else {
      activeMap = 'current';
      floor.visible = true;
      grid.visible = true;
      if (officeMap) officeMap.visible = false;
      movementStatus.textContent =
        '기본 공간입니다. 바닥 클릭 또는 WASD로 이동하세요.';
    }
  } catch (error) {
    console.error(error);
    mapSelect.value = 'current';
    activeMap = 'current';
    floor.visible = true;
    grid.visible = true;
    if (officeMap) officeMap.visible = false;
    movementStatus.textContent = '사무실 맵을 불러오지 못했습니다.';
  } finally {
    mapSelect.disabled = false;
  }
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

function createPlacedContainer(asset, content) {
  const container = new THREE.Group();
  container.name = `${asset.label} ${nextInstanceId}`;
  container.userData.editorAsset = true;
  container.userData.assetFile = asset.file;
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
    }

    editorRoot.add(container);
    placedObjects.push(container);
    selectEditorObject(container);
    syncPlacedList();
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

function selectEditorObject(object) {
  selectedEditorObject = object || null;
  if (selectedEditorObject) {
    transformControls.attach(selectedEditorObject);
    placedSelect.value = String(selectedEditorObject.userData.instanceId);
  } else {
    transformControls.detach();
    placedSelect.value = '';
  }
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
  if (
    currentMode !== 'editor' ||
    transformControls.dragging ||
    editorPanel.contains(event.target)
  ) {
    return;
  }
  setPointer(event);
  const hits = raycaster.intersectObjects(placedObjects, true);
  selectEditorObject(hits.length ? findPlacedAncestor(hits[0].object) : null);
}

function syncPlacedList() {
  const previous = selectedEditorObject?.userData.instanceId;
  placedSelect.innerHTML = '';
  placedObjects.forEach((object) => {
    const option = document.createElement('option');
    option.value = String(object.userData.instanceId);
    option.textContent = object.name;
    placedSelect.append(option);
  });
  if (previous) placedSelect.value = String(previous);
}

function removeSelectedObject(shouldSave = true) {
  if (!selectedEditorObject) return;
  const index = placedObjects.indexOf(selectedEditorObject);
  if (index >= 0) placedObjects.splice(index, 1);
  selectedEditorObject.removeFromParent();
  selectEditorObject(null);
  syncPlacedList();
  if (shouldSave) saveLayout();
  editorStatus.textContent = '선택한 객체를 삭제했습니다.';
}

async function duplicateSelectedObject() {
  if (!selectedEditorObject) return;
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
  };
  await addAsset(asset, transform);
}

function serializeLayout() {
  return placedObjects.map((object) => ({
    file: object.userData.assetFile,
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    scale: object.scale.toArray(),
  }));
}

function saveLayout() {
  localStorage.setItem(layoutStorageKey, JSON.stringify(serializeLayout()));
}

async function restoreLayout() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(layoutStorageKey) || '[]');
  } catch {
    saved = [];
  }
  if (!Array.isArray(saved) || saved.length === 0) return;

  editorStatus.textContent = `저장된 객체 ${saved.length}개를 복원하는 중...`;
  for (const item of saved) {
    const asset = assetCatalog.find((candidate) => candidate.file === item.file);
    if (asset) await addAsset(asset, item, false);
  }
  selectEditorObject(null);
  editorStatus.textContent = `저장된 객체 ${placedObjects.length}개를 복원했습니다.`;
}

function clearLayout() {
  transformControls.detach();
  placedObjects.splice(0).forEach((object) => object.removeFromParent());
  selectedEditorObject = null;
  syncPlacedList();
  saveLayout();
  editorStatus.textContent = '배치된 객체를 모두 비웠습니다.';
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
    const option = document.createElement('option');
    option.value = asset.file;
    option.textContent = asset.label;
    assetSelect.append(option);
  });
  if (filteredAssets.length) assetSelect.selectedIndex = 0;
  addAssetButton.disabled = filteredAssets.length === 0;
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
  $$('.tool-button').forEach((button) => {
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
  movementPanel.hidden = isEditor;
  editorPanel.hidden = !isEditor;
  editorHint.hidden = !isEditor;
  character.visible = !isEditor;
  destinationMarker.visible = !isEditor && isMoving;
  editorRoot.visible = isEditor;
  orbitControls.enabled = isEditor;
  transformControls.enabled = isEditor;
  transformControls.getHelper().visible = isEditor && Boolean(selectedEditorObject);

  if (officeMap) officeMap.visible = !isEditor && activeMap === 'office';
  floor.visible = isEditor || activeMap === 'current';
  grid.visible = isEditor || activeMap === 'current';

  pressedKeys.clear();
  if (isEditor) {
    camera.position.set(11, 13, 11);
    orbitControls.target.set(0, 0.8, 0);
    orbitControls.update();
  } else {
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

    animationSelect.innerHTML = '';
    if (squidMeshes.length) {
      squidMeshes.forEach((mesh, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `오징어 동작 샘플 ${index + 1}`;
        animationSelect.append(option);
      });
      animationSelect.disabled = false;
      showSquid(0);
      movementStatus.textContent =
        '준비 완료. 바닥 클릭 또는 WASD로 이동하세요.';
    } else {
      animationSelect.innerHTML = '<option>오징어 메시 없음</option>';
      movementStatus.textContent = '모델에서 오징어 메시를 찾지 못했습니다.';
    }
  },
  undefined,
  (error) => {
    console.error(error);
    movementStatus.textContent = '캐릭터 모델을 불러오지 못했습니다.';
  },
);

$$('.mode-button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

$$('.tool-button').forEach((button) => {
  button.addEventListener('click', () =>
    setTransformMode(button.dataset.transform),
  );
});

animationSelect.addEventListener('change', (event) => {
  showSquid(Number(event.target.value));
});

mapSelect.addEventListener('change', (event) => {
  changeMap(event.target.value);
});

assetSearch.addEventListener('input', renderAssetOptions);
assetSelect.addEventListener('dblclick', () => {
  const asset = assetCatalog.find((item) => item.file === assetSelect.value);
  addAsset(asset);
});
addAssetButton.addEventListener('click', () => {
  const asset = assetCatalog.find((item) => item.file === assetSelect.value);
  addAsset(asset);
});

placedSelect.addEventListener('change', () => {
  selectEditorObject(
    placedObjects.find(
      (object) =>
        object.userData.instanceId === Number(placedSelect.value),
    ) || null,
  );
});

$('#delete-object').addEventListener('click', () => removeSelectedObject());
$('#duplicate-object').addEventListener('click', duplicateSelectedObject);
$('#save-layout').addEventListener('click', () => {
  saveLayout();
  editorStatus.textContent = '현재 배치를 저장했습니다.';
});
$('#clear-layout').addEventListener('click', clearLayout);

canvas.addEventListener('pointerdown', setDestination);
canvas.addEventListener('click', selectFromCanvas);

window.addEventListener('keydown', (event) => {
  if (currentMode === 'editor') {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (event.code === 'KeyW') setTransformMode('translate');
    if (event.code === 'KeyE') setTransformMode('rotate');
    if (event.code === 'KeyR') setTransformMode('scale');
    if (event.code === 'Delete') removeSelectedObject();
    return;
  }

  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  event.preventDefault();
  pressedKeys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  if (currentMode !== 'movement') return;
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  pressedKeys.delete(event.code);
  if (pressedKeys.size === 0) {
    movementStatus.textContent =
      '준비 완료. 바닥 클릭 또는 WASD로 이동하세요.';
  }
});

window.addEventListener('blur', () => pressedKeys.clear());
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraProjection();
});

updateCameraProjection();
camera.position.copy(cameraOffset);
camera.lookAt(0, 0.65, 0);
fetchAssetCatalog();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  mixer?.update(delta);
  updateMovement(delta);
  updateQuarterView(delta);
  if (currentMode === 'editor') orbitControls.update();

  destinationMarker.material.opacity =
    0.55 + Math.sin(clock.elapsedTime * 5) * 0.25;
  renderer.render(scene, camera);
}

animate();

  return undefined;
}
