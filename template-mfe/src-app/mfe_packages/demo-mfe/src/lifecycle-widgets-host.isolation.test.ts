/**
 * The widgets host's bootstrap disables a package or an extension that the type
 * system or the registry rejects, alone: every other package still registers,
 * and no later extension may use an entry or a domain a disabled package
 * declared.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionDomain } from '@gears-frontx/react/mfe';
import { bootstrapWidgetsRuntime, type WidgetsBootstrapApp } from './lifecycle-widgets-host';

const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';
const widgetsDomain: ExtensionDomain = {
  id: WIDGETS_DOMAIN_ID,
  route: 'widgets',
  sharedProperties: [],
  actions: [],
  extensionsActions: [],
  defaultActionTimeout: 1000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
};

interface Instance {
  id: string;
}

/** A registry double whose type system rejects the instances named in `rejects`. */
function build(rejects: readonly string[]) {
  const registered: string[] = [];
  const registeredExtensions: string[] = [];
  const registry = {
    typeSystem: {
      registerSchema: vi.fn(),
      register: vi.fn((instance: Instance) => {
        if (rejects.includes(instance.id)) throw new Error(`rejected ${instance.id}`);
        registered.push(instance.id);
      }),
      validateInstance: () => ({ valid: true, errors: [] }),
    },
    getDomain: () => undefined,
    getExtension: () => undefined,
    registerDomain: vi.fn(),
    registerExtension: vi.fn(async (extension: Instance) => {
      registeredExtensions.push(extension.id);
    }),
  };
  const app: WidgetsBootstrapApp = { mfeRegistry: registry };
  return { app, registered, registeredExtensions, registry };
}

function serve(manifests: unknown[]): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => manifests }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bootstrapWidgetsRuntime — one rejected package or extension disables only itself', () => {
  it('disables the package whose manifest the type system rejects and registers every other package', async () => {
    const { app, registered, registeredExtensions } = build(['manifest.broken']);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const widgetExt = { id: 'ext.widget', domain: WIDGETS_DOMAIN_ID, entry: 'entry.widget' };
    serve([
      { manifest: { id: 'manifest.broken' }, domains: [], entries: [{ id: 'entry.broken' }], extensions: [] },
      { manifest: { id: 'manifest.good' }, domains: [widgetsDomain], entries: [{ id: 'entry.widget' }], extensions: [widgetExt] },
    ]);

    await expect(bootstrapWidgetsRuntime(app)).resolves.toBe(widgetsDomain);

    expect(registered).toContain('manifest.good');
    expect(registered).not.toContain('entry.broken');
    expect(registeredExtensions).toEqual(['ext.widget']);
  });

  it('disables only the extension the registry rejects', async () => {
    const { app, registeredExtensions, registry } = build([]);
    registry.registerExtension.mockImplementation(async (extension: Instance) => {
      if (extension.id === 'ext.bad') throw new Error('rejected extension');
      registeredExtensions.push(extension.id);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve([
      {
        manifest: { id: 'manifest.good' },
        domains: [widgetsDomain],
        entries: [{ id: 'entry.widget' }],
        extensions: [
          { id: 'ext.bad', domain: WIDGETS_DOMAIN_ID, entry: 'entry.widget' },
          { id: 'ext.good', domain: WIDGETS_DOMAIN_ID, entry: 'entry.widget' },
        ],
      },
    ]);

    await expect(bootstrapWidgetsRuntime(app)).resolves.toBe(widgetsDomain);

    expect(registeredExtensions).toEqual(['ext.good']);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('ext.bad'), expect.any(Error));
  });

  it.each([
    ['entry', { id: 'ext.user', domain: WIDGETS_DOMAIN_ID, entry: 'entry.broken' }, /entry 'entry\.broken'.*manifest\.broken/],
    ['domain', { id: 'ext.user', domain: 'domain.broken', entry: 'entry.widget' }, /domain 'domain\.broken'.*manifest\.broken/],
  ])('rejects a later extension whose %s belongs to a disabled package', async (_kind, user, message) => {
    const { app, registeredExtensions } = build(['entry.broken']);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve([
      {
        manifest: { id: 'manifest.broken' },
        domains: [{ id: 'domain.broken' }],
        entries: [{ id: 'entry.broken' }],
        extensions: [],
      },
      {
        manifest: { id: 'manifest.good' },
        domains: [widgetsDomain],
        entries: [{ id: 'entry.widget' }],
        extensions: [user, { id: 'ext.widget', domain: WIDGETS_DOMAIN_ID, entry: 'entry.widget' }],
      },
    ]);

    await expect(bootstrapWidgetsRuntime(app)).resolves.toBe(widgetsDomain);

    expect(registeredExtensions).toEqual(['ext.widget']);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('ext.user'),
      expect.objectContaining({ message: expect.stringMatching(message) }),
    );
  });
});
