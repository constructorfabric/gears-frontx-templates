// A shared package whose own code lazily imports another shared package
// by bare specifier.
export async function open() {
  const leaf = await import('lazy-leaf-kit/sub');
  return leaf.label;
}
