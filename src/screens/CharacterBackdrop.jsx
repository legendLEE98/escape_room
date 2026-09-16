import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Same character catalog the editor's movement.js uses — sparrow.glb is a
// dedicated single-character file (no per-mesh tag filtering needed here,
// unlike the bundled animal pack fallback).
const CHARACTER_URL = '/models/assets/character/sparrow.glb';

export default function CharacterBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let disposed = false;
    let frameId = null;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const cameraRadius = 4.2;
    const cameraHeight = 1.55;
    let cameraAngle = Math.PI * 0.32;

    scene.add(new THREE.HemisphereLight('#c9dcff', '#172033', 2.4));
    const keyLight = new THREE.DirectionalLight('#fff4df', 3.4);
    keyLight.position.set(4, 6, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#6aa7ff', 2.2);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    const pivot = new THREE.Group();
    pivot.position.y = 0.9;
    scene.add(pivot);

    let mixer = null;
    let idleAction = null;

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      CHARACTER_URL,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) child.castShadow = false;
        });

        // Center and scale to a consistent on-screen size regardless of the
        // source GLB's own units (mirrors editor/core/movement.js's
        // fitModelToCharacter approach).
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const largestDimension = Math.max(size.x, size.y, size.z);
        const scale = largestDimension > 0 ? 1.7 / largestDimension : 1;
        model.scale.setScalar(scale);

        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        pivot.add(model);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          const idleClip =
            gltf.animations.find((clip) => /idle/i.test(clip.name)) ?? gltf.animations[0];
          idleAction = mixer.clipAction(idleClip);
          idleAction.play();
        }
      },
      undefined,
      (error) => console.error('Failed to load landing character model', error),
    );

    const clock = new THREE.Clock();

    function resize() {
      const { clientWidth, clientHeight } = canvas;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    function animate() {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);

      // Slow ambient turntable — purely decorative, not user-driven.
      cameraAngle += delta * 0.12;
      camera.position.set(
        Math.cos(cameraAngle) * cameraRadius,
        cameraHeight,
        Math.sin(cameraAngle) * cameraRadius,
      );
      camera.lookAt(0, 1, 0);

      renderer.render(scene, camera);
    }

    resize();
    animate();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material?.dispose());
        }
      });
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-character-canvas" />;
}
