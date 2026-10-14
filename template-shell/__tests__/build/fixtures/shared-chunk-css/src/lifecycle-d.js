import { toolbarClass } from './toolbar.js';

export default {
  mount(container) {
    container.className = `common ${toolbarClass}`;
  },
  unmount() {},
};
