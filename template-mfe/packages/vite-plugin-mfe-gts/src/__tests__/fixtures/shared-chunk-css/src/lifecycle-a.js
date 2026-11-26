import './own-a.css';
import { frameClass } from './shared.js';

export default {
  mount(container) {
    container.className = `own-a ${frameClass()}`;
  },
  unmount() {},
};
