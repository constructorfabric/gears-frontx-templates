import { frameClass } from './shared.js';

export default {
  mount(container) {
    container.className = frameClass();
  },
  unmount() {},
};
