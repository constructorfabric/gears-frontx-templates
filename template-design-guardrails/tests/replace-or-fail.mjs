/**
 * Test edits that fail when they match nothing: a broken-copy row built with
 * them cannot pass on the unchanged page after the example's markup moves on.
 * Import it for its effect; it adds two String methods to the test process.
 */
const define = (name, method) => Object.defineProperty(String.prototype, name, {
  configurable: true,
  value(from, to) {
    const text = String(this);
    const out = text[method](from, to);
    if (out === text) throw new Error(`the edit matched nothing: ${String(from).slice(0, 80)}`);
    return out;
  },
});
define('replaceOrFail', 'replace');
define('replaceAllOrFail', 'replaceAll');
