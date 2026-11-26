// Imports the shared package `lazy-kit` only dynamically, by bare
// specifier, and makes one fully opaque dynamic import.
export default {
  async mount(container) {
    const kit = await import('lazy-kit');
    const target = container.dataset.target;
    const extra = await import(target);
    container.textContent = `${kit.label} ${String(extra)}`;
  },
  unmount() {},
};
