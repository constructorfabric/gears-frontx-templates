// Two bare lazy imports of shared packages, each triggered by a click.
//
// - lazy-own-kit is reached only by this module's own `import('lazy-own-kit')`.
// - lazy-host-kit is imported statically; its own code lazily imports
//   lazy-leaf-kit, which nothing else reaches.
import { open } from 'lazy-host-kit';

function section(container, name, label) {
  const root = document.createElement('section');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = `${name}-trigger`;
  button.textContent = label;
  const output = document.createElement('output');
  output.dataset.testid = `${name}-output`;
  root.append(button, output);
  container.append(root);
  return { button, output };
}

function report(output, run) {
  run().catch((error) => {
    output.textContent = `failed: ${String(error)}`;
    // Surfaces in the console so the spec's error filter sees it.
    console.error(error);
  });
}

export default {
  mount(container) {
    const own = section(container, 'lazy-own', 'Load own-code lazy kit');
    own.button.addEventListener('click', () =>
      report(own.output, async () => {
        const kit = await import('lazy-own-kit');
        own.output.textContent = kit.label;
      })
    );
    const host = section(container, 'lazy-shared', 'Load shared-unit lazy kit');
    host.button.addEventListener('click', () =>
      report(host.output, async () => {
        host.output.textContent = await open();
      })
    );
  },
  unmount(container) {
    container.replaceChildren();
  },
};
