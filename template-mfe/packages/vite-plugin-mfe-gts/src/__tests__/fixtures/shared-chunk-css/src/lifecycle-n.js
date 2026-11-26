export default {
  async mount(container) {
    await import('./theme-n.js');
    container.className = 'theme-n';
  },
  unmount() {},
};
