// Cleanup registry for a scene. Anything that attaches a listener to the window
// or canvas, or starts a timer/animation loop, registers how to undo it here,
// so leaving a screen (editor, lobby, game) fully tears the scene down instead
// of leaving loops and handlers running behind it.
export function initLifecycle(ctx) {
  const disposers = [];

  ctx.addDisposer = (fn) => {
    disposers.push(fn);
  };

  // addEventListener that is automatically removed on dispose.
  ctx.listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };

  // Runs every registered cleanup, newest first, once.
  ctx.dispose = () => {
    while (disposers.length) {
      try {
        disposers.pop()();
      } catch (error) {
        console.error(error);
      }
    }
  };
}
