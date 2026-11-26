export default {
  async mount(container) {
    await import('./theme.css');
    container.className = 'theme';
  },
  unmount() {},
};
