// Imports a component of `fixture-shared-kit`, a shared package whose
// component modules import their own stylesheets, and lazily a module that
// imports another of its components: the stylesheets of the components
// used reach the expose's CSS lists (the lazy one as async), and no other
// component's stylesheet does.
import { KitButton } from 'fixture-shared-kit';

export default {
  async mount(container) {
    const { lazyKitClass } = await import('./lazy-kit.js');
    container.className = `${KitButton()} ${lazyKitClass}`;
  },
  unmount() {},
};
