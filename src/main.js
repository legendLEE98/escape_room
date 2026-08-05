import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './style.css';

const canvas = document.querySelector('#scene');
const panel = document.querySelector('.panel');
const status = document.querySelector('#status');
const animationSelect = document.querySelector('#animation');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#10151d');

const camera = new THREE.OrthographicCamera();
const cameraOffset = new THREE.Vector3(8, 10, 8);
const cameraTarget = new THREE.Vector3();

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

const grid = new THREE.GridHelper(30, 30, '#34445b', '#253246');
grid.position.y = 0.01;
grid.material.opacity = 0.32;
grid.material.transparent = true;
scene.add(grid);

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

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const destination = new THREE.Vector3();
const movementDirection = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const keyboardDirection = new THREE.Vector3();
const pressedKeys = new Set();
const clock = new THREE.Clock();

let mixer = null;
let squidMeshes = [];
let loadedModel = null;
let isMoving = false;
let characterSpeed = 2.8;
const modelHeadingCorrection = THREE.MathUtils.degToRad(-17);

function updateCameraProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  const viewHeight = 10;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();
}

function updateQuarterView(delta) {
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
  if (largestDimension > 0) {
    const desiredHeight = 1.35;
    character.scale.setScalar(desiredHeight / largestDimension);
  }
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

function setDestination(event) {
  if (panel.contains(event.target)) return;

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hit = raycaster.intersectObject(floor, false)[0];
  if (!hit) return;

  destination.copy(hit.point);
  destination.y = 0;
  destinationMarker.position.x = destination.x;
  destinationMarker.position.z = destination.z;
  destinationMarker.visible = true;

  isMoving = true;
  status.textContent = '목표 지점으로 이동 중';
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
  character.position.addScaledVector(movementDirection, characterSpeed * delta);
  const distanceFromCenter = Math.hypot(
    character.position.x,
    character.position.z,
  );
  if (distanceFromCenter > 17.5) {
    const boundaryScale = 17.5 / distanceFromCenter;
    character.position.x *= boundaryScale;
    character.position.z *= boundaryScale;
  }
  rotateTowardsMovement(delta);

  isMoving = false;
  destinationMarker.visible = false;
  status.textContent = 'WASD로 이동 중';
  return true;
}

function updateMovement(delta) {
  if (updateKeyboardMovement(delta)) return;
  if (!isMoving) return;

  movementDirection.subVectors(destination, character.position);
  movementDirection.y = 0;
  const remainingDistance = movementDirection.length();

  if (remainingDistance < 0.04) {
    character.position.copy(destination);
    isMoving = false;
    destinationMarker.visible = false;
    status.textContent = '도착 · 바닥을 클릭해 이동';
    return;
  }

  movementDirection.normalize();
  const step = Math.min(characterSpeed * delta, remainingDistance);
  character.position.addScaledVector(movementDirection, step);

  rotateTowardsMovement(delta);
}

new GLTFLoader().load(
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
      status.textContent = '준비 완료 · 클릭 또는 WASD로 이동';
    } else {
      animationSelect.innerHTML = '<option>오징어를 찾지 못함</option>';
      status.textContent = '모델에서 오징어 메시를 찾지 못했습니다.';
    }
  },
  undefined,
  (error) => {
    console.error(error);
    status.textContent = '모델을 불러오지 못했습니다.';
  },
);

animationSelect.addEventListener('change', (event) => {
  showSquid(Number(event.target.value));
});

canvas.addEventListener('pointerdown', setDestination);

window.addEventListener('keydown', (event) => {
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  event.preventDefault();
  pressedKeys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
  pressedKeys.delete(event.code);
  if (pressedKeys.size === 0) {
    status.textContent = '준비 완료 · 클릭 또는 WASD로 이동';
  }
});

window.addEventListener('blur', () => {
  pressedKeys.clear();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraProjection();
});

updateCameraProjection();
camera.position.copy(cameraOffset);
camera.lookAt(0, 0.65, 0);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  mixer?.update(delta);
  updateMovement(delta);
  updateQuarterView(delta);

  destinationMarker.material.opacity =
    0.55 + Math.sin(clock.elapsedTime * 5) * 0.25;

  renderer.render(scene, camera);
}

animate();
