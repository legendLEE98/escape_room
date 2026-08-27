export function initInteraction(ctx) {
  function syncDoorFieldsVisibility() {
    ctx.interactionDoorFields.hidden = ctx.interactionType.value !== 'door';
  }

  function populateConnectedRoomOptions(object) {
    ctx.interactionConnectedRoom.innerHTML = '';
    if (!object) return;
    ctx.rooms
      .filter((room) => room.instanceId !== ctx.getObjectRoomInstanceId(object))
      .forEach((room) => {
        const option = document.createElement('option');
        option.value = String(room.instanceId);
        option.textContent = room.name;
        ctx.interactionConnectedRoom.append(option);
      });
  }

  ctx.updateInteractionFromSelection = () => {
    const count = ctx.multiSelection.size;
    ctx.interactionBody.hidden = count === 0;
    ctx.interactionEmpty.hidden = count > 0;
    if (count === 0) return;

    ctx.inspectorBgImage.value = '';
    const bgImageUrl = count === 1 ? ctx.selectedEditorObject.userData.bgImageUrl || '' : '';
    ctx.inspectorBgPreview.hidden = !bgImageUrl;
    ctx.inspectorBgPreview.src = bgImageUrl;

    const single = count === 1 ? ctx.selectedEditorObject : null;
    ctx.interactionType.disabled = count !== 1;
    ctx.interactionType.value = single?.userData.interactionType || 'none';
    syncDoorFieldsVisibility();

    populateConnectedRoomOptions(single);
    ctx.interactionConnectedRoom.value =
      single?.userData.connectedRoomId != null ? String(single.userData.connectedRoomId) : '';
  };

  ctx.interactionType.addEventListener('change', () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    ctx.selectedEditorObject.userData.interactionType =
      ctx.interactionType.value === 'none' ? null : ctx.interactionType.value;
    syncDoorFieldsVisibility();

    if (ctx.interactionType.value === 'door') {
      populateConnectedRoomOptions(ctx.selectedEditorObject);
      ctx.interactionConnectedRoom.value =
        ctx.selectedEditorObject.userData.connectedRoomId != null
          ? String(ctx.selectedEditorObject.userData.connectedRoomId)
          : '';
    }
    ctx.saveLayout();
  });

  ctx.interactionConnectedRoom.addEventListener('change', () => {
    if (!ctx.selectedEditorObject || ctx.multiSelection.size !== 1) return;
    const value = ctx.interactionConnectedRoom.value;
    ctx.selectedEditorObject.userData.connectedRoomId = value ? Number(value) : null;
    ctx.saveLayout();
  });

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
