export function initInteraction(ctx) {
  ctx.updateInteractionFromSelection = () => {
    const count = ctx.multiSelection.size;
    ctx.interactionBody.hidden = count === 0;
    ctx.interactionEmpty.hidden = count > 0;
    if (count === 0) return;

    ctx.inspectorBgImage.value = '';
    const bgImageUrl = count === 1 ? ctx.selectedEditorObject.userData.bgImageUrl || '' : '';
    ctx.inspectorBgPreview.hidden = !bgImageUrl;
    ctx.inspectorBgPreview.src = bgImageUrl;
  };

  ctx.inspectorBgImage.addEventListener('change', () => {
    if (!ctx.selectedEditorObject) return;
    const file = ctx.inspectorBgImage.files[0];
    if (!file) return;

    const previousUrl = ctx.selectedEditorObject.userData.bgImageUrl;
    if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);

    const objectUrl = URL.createObjectURL(file);
    ctx.selectedEditorObject.userData.bgImageUrl = objectUrl;
    ctx.inspectorBgPreview.hidden = false;
    ctx.inspectorBgPreview.src = objectUrl;
  });
}
