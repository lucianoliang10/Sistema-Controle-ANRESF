const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const targetPanel = item.dataset.panel;

    navItems.forEach((nav) => nav.classList.remove('active'));
    panels.forEach((panel) => panel.classList.remove('active-panel'));

    item.classList.add('active');
    document.getElementById(targetPanel).classList.add('active-panel');
  });
});
