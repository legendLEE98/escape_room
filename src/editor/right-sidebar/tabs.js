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

  ctx.setRightTab = (tab) => {
    ctx.activeRightTab = tab;
    apply();
  };

  ctx.rightTabButtons.forEach((button) => {
    button.addEventListener('click', () => ctx.setRightTab(button.dataset.tab));
  });

  apply();
}
