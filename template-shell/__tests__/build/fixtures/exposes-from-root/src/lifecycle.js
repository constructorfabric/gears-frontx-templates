import { greeting } from './greeting.js';

export default {
  mount(container) {
    container.textContent = greeting();
  },
  unmount() {},
};
