export default {
  async mount(container) {
    await import ( "./theme-m.css" );
    container.className = 'theme-m';
  },
  unmount() {},
};
