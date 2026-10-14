import './own-o.css';

export default {
  async mount() {
    await import('./empty.css');
  },
  unmount() {},
};
