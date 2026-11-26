export default {
  async mount(container) {
    await import('./' + 'missing-lazy.js');
    container.className = 'missing-lazy';
  },
  unmount() {},
};
