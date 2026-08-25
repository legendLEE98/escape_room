export function initAssetBrowser(ctx) {
  ctx.renderAssetOptions = () => {
    const query = ctx.assetSearch.value.trim().toLowerCase();
    ctx.filteredAssets = ctx.assetCatalog.filter((asset) =>
      `${asset.label} ${asset.collection}`.toLowerCase().includes(query),
    );
    ctx.assetSelect.innerHTML = '';
    ctx.filteredAssets.forEach((asset) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'asset-card';
      card.dataset.file = asset.file;
      card.setAttribute('role', 'option');

      const thumb = document.createElement('span');
      thumb.className = 'asset-card-thumb';
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = ctx.thumbnailCanvasSize;
      thumbCanvas.height = ctx.thumbnailCanvasSize;
      thumbCanvas.dataset.file = asset.file;
      thumb.append(thumbCanvas);

      const label = document.createElement('span');
      label.className = 'asset-card-label';
      label.textContent = asset.label;

      card.append(thumb, label);
      card.addEventListener('click', () => ctx.selectAssetCard(asset.file));
      card.addEventListener('dblclick', () => ctx.addAsset(asset));
      ctx.assetSelect.append(card);

      ctx.thumbnailObserver.observe(thumbCanvas);
    });

    ctx.addAssetButton.disabled = ctx.filteredAssets.length === 0;
    ctx.selectAssetCard(ctx.filteredAssets.length ? ctx.filteredAssets[0].file : '');
  };

  ctx.assetSearch.addEventListener('input', ctx.renderAssetOptions);
  ctx.addAssetButton.addEventListener('click', () => {
    const asset = ctx.assetCatalog.find((item) => item.file === ctx.selectedAssetFile);
    ctx.addAsset(asset);
  });

  ctx.sidebarLeftToggle.addEventListener('click', () => {
    const collapsed = ctx.sidebarLeft.dataset.collapsed === 'true';
    ctx.sidebarLeft.dataset.collapsed = String(!collapsed);
    document.body.classList.toggle('sidebar-left-collapsed', !collapsed);
  });
}
