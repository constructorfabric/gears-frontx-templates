import './own-b.css';
import { frameClass } from './shared.js';

export default {
  async mount(container) {
    const { lazyPanelClass } = await import('./lazy-panel.js');
    const { lazyOtherClass } = await import('./lazy-other.js');
    container.className = `own-b ${frameClass()} ${lazyPanelClass} ${lazyOtherClass}`;
  },
  unmount() {},
};
