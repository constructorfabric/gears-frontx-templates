export default {
  async mount(container) {
    const { lazyPlainClass } = await import('./lazy-plain.js');
    container.className = lazyPlainClass;
  },
  unmount() {},
};
