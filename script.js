const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');

function activatePanel(targetPanelId, selectedItem) {
  navItems.forEach((nav) => {
    const isActive = nav === selectedItem;
    nav.classList.toggle('active', isActive);
    nav.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach((panel) => {
    panel.classList.toggle('active-panel', panel.id === targetPanelId);
  });
}

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    activatePanel(item.dataset.panel, item);
  });
});
