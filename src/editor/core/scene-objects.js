import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function buildSceneObjects(canvas) {
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
  loader.setMeshoptDecoder(MeshoptDecoder);

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

  return {
    renderer,
    scene,
    camera,
    cameraOffset,
    cameraTarget,
    clock,
    loader,
    floor,
    grid,
    navigationSurface,
    destinationMarker,
    character,
    editorRoot,
    orbitControls,
    transformControls,
  };
}
