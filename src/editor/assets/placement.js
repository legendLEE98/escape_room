// Editor-side placement: wraps the engine's object factory with what only the
// editor does — select the new object, refresh the hierarchy, autosave, and
// report status in the sidebar.
export function initPlacement(ctx) {
  ctx.addAsset = async (asset, transform = null, shouldSave = true) => {
    if (!asset) return null;
    ctx.editorStatus.textContent = `${asset.label} 불러오는 중...`;
    ctx.addAssetButton.disabled = true;

    try {
      const container = await ctx.createAssetObject(asset, transform);
      ctx.selectEditorObject(container);
      ctx.syncHierarchy();
      if (shouldSave) ctx.saveLayout();
      ctx.editorStatus.textContent = `${asset.label}을 배치했습니다.`;
      return container;
    } catch (error) {
      console.error(error);
      ctx.editorStatus.textContent = `${asset.label}을 불러오지 못했습니다.`;
      return null;
    } finally {
      ctx.addAssetButton.disabled = ctx.assetCatalog.length === 0;
    }
  };

  ctx.addEmptyObject = (transform = null, shouldSave = true) => {
    const container = ctx.createEmptyObject(transform);
    ctx.selectEditorObject(container);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = '빈 오브젝트를 추가했습니다.';
    return container;
  };

  ctx.addSpawnPoint = (transform = null, shouldSave = true) => {
    const roomInstanceId = transform?.roomInstanceId ?? ctx.currentRoomInstanceId;

    if (!transform) {
      const existing = ctx.placedObjects.find(
        (object) => object.userData.isSpawnPoint && ctx.getObjectRoomInstanceId(object) === roomInstanceId,
      );
      if (existing) {
        ctx.selectEditorObject(existing);
        ctx.editorStatus.textContent = '이미 이 방에 스폰 위치가 있습니다.';
        return existing;
      }
    }

    const container = ctx.createSpawnPointObject(transform);
    ctx.selectEditorObject(container);
    ctx.syncHierarchy();
    if (shouldSave) ctx.saveLayout();
    ctx.editorStatus.textContent = '스폰 위치를 추가했습니다.';
    return container;
  };
}
