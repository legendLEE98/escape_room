import * as THREE from 'three';
import { cloneMaterials } from '../assets/catalog.js';

export const THUMBNAIL_SIZE = 96;

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

export function initAssetPreview(ctx) {
  ctx.thumbnailCanvasSize = THUMBNAIL_SIZE;
  ctx.selectedAssetFile = '';

  const thumbnailRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  thumbnailRenderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
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
    const drawCtx = targetCanvas.getContext('2d');
    if (!drawCtx) return;
    const image = new Image();
    image.onload = () => {
      drawCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      drawCtx.drawImage(image, 0, 0, targetCanvas.width, targetCanvas.height);
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
      const template = await ctx.loadAssetTemplate(asset);
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

  ctx.thumbnailObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const targetCanvas = entry.target;
        ctx.thumbnailObserver.unobserve(targetCanvas);
        const asset = ctx.assetCatalog.find((item) => item.file === targetCanvas.dataset.file);
        if (asset) renderThumbnail(asset, targetCanvas);
      });
    },
    { root: ctx.assetSelect, threshold: 0.1 },
  );

  ctx.selectAssetCard = (file) => {
    ctx.selectedAssetFile = file;
    ctx.assetSelect.querySelectorAll('.asset-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.file === file);
    });
  };
}
