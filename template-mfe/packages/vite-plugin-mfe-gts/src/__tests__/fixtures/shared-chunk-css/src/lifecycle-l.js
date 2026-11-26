export default {
  async mount(container) {
    await import(/* c */ './theme-l.css');
    container.className = 'theme-l';
  },
  unmount() {},
};
