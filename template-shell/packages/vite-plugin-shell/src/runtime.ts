/**
 * `@gears-frontx/vite-plugin-shell/runtime` — the browser runtime the
 * emitted fill chunk bundles: `ShellCacheFill.run(data)` refills the
 * realm content-identity text cache from the boot list after the
 * shell's native boot. Not part of the Node plugin API.
 */

export { ShellCacheFill } from './runtime/ShellCacheFill';
export type { ShellCacheFillData } from './runtime/ShellCacheFill';
