// Orthographic framing: how much of the world fits on screen, kept in sync with
// the size of the view. Play views are tighter than the editor's.
//
// By default the view is the whole window (the editor's full-screen canvas).
// `sizeToCanvas` makes it the canvas's own CSS box instead, for screens where
// the 3D view shares the page with other UI (the game room's sidebar).
export function initCameraProjection(ctx, { sizeToCanvas = false } = {}) {
  const viewportSize = () =>
    sizeToCanvas
      ? { width: ctx.canvas.clientWidth, height: ctx.canvas.clientHeight }
      : { width: window.innerWidth, height: window.innerHeight };

  ctx.updateCameraProjection = () => {
    const { width, height } = viewportSize();
    if (!width || !height) return;
    const aspect = width / height;
    const viewHeight = ctx.currentMode === 'editor' || ctx.currentMode === 'roomBuilder' || ctx.currentMode === 'roomLink' ? 16 : 10;
    ctx.camera.left = (-viewHeight * aspect) / 2;
    ctx.camera.right = (viewHeight * aspect) / 2;
    ctx.camera.top = viewHeight / 2;
    ctx.camera.bottom = -viewHeight / 2;
    ctx.camera.near = 0.01;
    ctx.camera.far = 200;
    ctx.camera.updateProjectionMatrix();
  };

  ctx.resizeViewport = () => {
    const { width, height } = viewportSize();
    if (!width || !height) return;
    // false = leave the canvas's CSS size to the page layout.
    ctx.renderer.setSize(width, height, !sizeToCanvas);
    ctx.updateCameraProjection();
  };

  ctx.listen(window, 'resize', ctx.resizeViewport);
  if (sizeToCanvas) {
    const observer = new ResizeObserver(ctx.resizeViewport);
    observer.observe(ctx.canvas);
    ctx.addDisposer(() => observer.disconnect());
  }
}
