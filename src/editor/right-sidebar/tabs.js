export function initRightTabs(ctx) {
  ctx.activeRightTab = 'objects';

  function apply() {
    ctx.rightTabButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === ctx.activeRightTab);
    });
    ctx.rightTabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== ctx.activeRightTab;
    });
  }

  ctx.rightTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      ctx.activeRightTab = button.dataset.tab;
      apply();
    });
  });

  apply();
}
