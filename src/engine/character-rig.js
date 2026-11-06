import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const CHARACTER_DIRECTORY = '/models/assets/character/';
const PREFERRED_CHARACTER_FILE = 'sparrow.glb';
const FALLBACK_CHARACTER_FILE = 'quirky_series_-_free_animals_pack.glb';

// Only used by the bundled animal-pack fallback, where many characters are
// baked into one file and tagged by material name.
const IDLE_SQUID_INDEX = 5;
const WALK_SQUID_INDEX = 1;
const ANIMATION_CROSSFADE_SECONDS = 0.25;
// Characters are fitted to 1 world unit across their largest dimension, then
// shrunk by this.
export const CHARACTER_SIZE_FACTOR = 0.8;

async function resolveCharacterUrl() {
  try {
    const response = await fetch(`${CHARACTER_DIRECTORY}character-index.json`, { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      const files = data.files ?? [];
      const file = files.includes(PREFERRED_CHARACTER_FILE) ? PREFERRED_CHARACTER_FILE : files[0];
      if (file) return `${CHARACTER_DIRECTORY}${encodeURIComponent(file)}`;
    }
  } catch (error) {
    console.warn('Character index unavailable, falling back to default character.', error);
  }
  return `${CHARACTER_DIRECTORY}${encodeURIComponent(FALLBACK_CHARACTER_FILE)}`;
}

// The model file is fetched and parsed once per loader; every rig (the local
// player and each remote player) clones from that one result.
const templates = new WeakMap();
function loadCharacterTemplate(loader) {
  if (!templates.has(loader)) {
    templates.set(
      loader,
      resolveCharacterUrl().then(
        (url) =>
          new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          }),
      ),
    );
  }
  return templates.get(loader);
}

// One animated character. `group` is what callers position/rotate in the
// scene; the model, its idle/run animations and their crossfade live inside.
// Safe to use before the model has loaded — calls are just no-ops until then.
export function createCharacterRig(loader, group = new THREE.Group()) {
  const rig = {
    group,
    mixer: null,
    loadedModel: null,
    squidMeshes: [],
    ready: null,
    setMoving,
    update,
    dispose,
  };

  let characterScale = null;
  let currentSquidIndex = -1;
  let idleAction = null;
  let runAction = null;
  let isAnimatingRun = null;

  function fitModelToCharacter(selected) {
    if (!selected || !rig.loadedModel) return;
    rig.loadedModel.position.set(0, 0, 0);
    group.scale.setScalar(1);
    rig.loadedModel.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(selected);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const localCenter = group.worldToLocal(center.clone());

    if (characterScale === null) {
      const largestDimension = Math.max(size.x, size.y, size.z);
      characterScale = largestDimension > 0 ? CHARACTER_SIZE_FACTOR / largestDimension : CHARACTER_SIZE_FACTOR;
    }

    rig.loadedModel.position.x -= localCenter.x;
    rig.loadedModel.position.z -= localCenter.z;
    rig.loadedModel.position.y -= localCenter.y - size.y / 2;

    group.scale.setScalar(characterScale);
    rig.loadedModel.updateMatrixWorld(true);
  }

  function showSquid(index) {
    const selected = rig.squidMeshes[index];
    if (!selected) return;
    rig.squidMeshes.forEach((mesh) => {
      mesh.visible = mesh === selected;
    });
    fitModelToCharacter(selected);
  }

  // Switches between the idle and run animations. Fire it on state change
  // only (or every frame with the same value — repeats are ignored): THREE's
  // fadeIn/fadeOut always ramp from a hard-coded 0 or 1 rather than the
  // action's current weight, so re-triggering mid-fade would keep resetting it.
  function setMoving(moving) {
    if (rig.squidMeshes.length) {
      const targetIndex = Math.min(moving ? WALK_SQUID_INDEX : IDLE_SQUID_INDEX, rig.squidMeshes.length - 1);
      if (targetIndex !== currentSquidIndex) {
        currentSquidIndex = targetIndex;
        showSquid(targetIndex);
      }
    }

    if (idleAction && runAction && moving !== isAnimatingRun) {
      isAnimatingRun = moving;
      const active = moving ? runAction : idleAction;
      const inactive = moving ? idleAction : runAction;
      active.reset().fadeIn(ANIMATION_CROSSFADE_SECONDS).play();
      inactive.fadeOut(ANIMATION_CROSSFADE_SECONDS);
    }
  }

  function update(delta) {
    rig.mixer?.update(delta);
  }

  function dispose() {
    rig.mixer?.stopAllAction();
    if (rig.loadedModel) rig.mixer?.uncacheRoot(rig.loadedModel);
    group.removeFromParent();
  }

  rig.ready = loadCharacterTemplate(loader)
    .then((gltf) => {
      const model = cloneSkinned(gltf.scene);
      rig.loadedModel = model;

      const meshes = [];
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        meshes.push(child);
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        if (materials.some((material) => material?.name === 'M_Inkfish')) {
          rig.squidMeshes.push(child);
        }
      });
      // The bundled animal pack has many characters baked into one file and needs
      // this tag to isolate just the squid meshes. A dedicated single-character
      // file won't have that tag at all, so fall back to showing everything.
      if (rig.squidMeshes.length > 0) {
        meshes.forEach((mesh) => {
          mesh.visible = rig.squidMeshes.includes(mesh);
        });
      } else {
        meshes.forEach((mesh) => {
          mesh.visible = true;
        });
      }
      group.add(model);
      if (rig.squidMeshes.length === 0) {
        fitModelToCharacter(model);
      }

      if (gltf.animations.length) {
        rig.mixer = new THREE.AnimationMixer(model);
        const idleClip = gltf.animations.find((clip) => /idle/i.test(clip.name));
        const runClip = gltf.animations.find((clip) => /run/i.test(clip.name));
        if (idleClip && runClip) {
          // Named idle/run pair (e.g. sparrow.glb) — crossfade between them by
          // movement state instead of just playing every clip at once.
          idleAction = rig.mixer.clipAction(idleClip);
          runAction = rig.mixer.clipAction(runClip);
          // Leave .weight at its default of 1 for both — fadeIn/fadeOut multiply
          // their ramp against .weight, so setEffectiveWeight(0) here would
          // permanently pin it to 0 and silently break every future fadeIn.
          idleAction.play();
          runAction.play();
        } else {
          // No recognizable idle/run naming (e.g. the bundled animal pack) —
          // fall back to the old behavior of just playing every clip.
          gltf.animations.forEach((clip) => rig.mixer.clipAction(clip).play());
        }
      }

      setMoving(false);
      return rig;
    })
    .catch((error) => {
      console.error(error);
      return rig;
    });

  return rig;
}
