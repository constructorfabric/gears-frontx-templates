import { badgeClass } from './shared-badge.js';

export default {
  mount(container) {
    container.className = badgeClass;
  },
  unmount() {},
};
