import { afterEach, describe, expect, it, vi } from 'vitest';
import { gtsPlugin } from '@gears-frontx/react';
import {
  extensionScreenSchema,
  languageCodeSchema,
  languageSchema,
  screenLabelsSchema,
} from '@gears-frontx/frontx-template-shell';
import { labelDictionaryUrl, MenuLabels } from './menuLabels';

const extension = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.profile.v1';
const blankExtension = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.blank.screens.home.v1';
const dictionary = (language: string, label = 'Profile') => ({
  type: 'gts.frontx.i18n.dict.screen_labels.v1~',
  language,
  labels: [{ extension, label }],
});

function store(): typeof gtsPlugin {
  const Plugin = gtsPlugin.constructor as new (options: { isolated: boolean }) => typeof gtsPlugin;
  const plugin = new Plugin({ isolated: true });
  plugin.registerSchema(languageCodeSchema);
  plugin.registerSchema(languageSchema);
  plugin.registerSchema(extensionScreenSchema);
  plugin.registerSchema(screenLabelsSchema);
  plugin.register({
    id: extension,
    domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1',
    route: '/profile',
    presentation: { label: 'Profile' },
  });
  plugin.register({
    id: blankExtension,
    domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.blank.mfe.home.v1',
    route: '/blank-home',
    presentation: { label: 'Blank Home' },
  });
  return plugin;
}

afterEach(() => vi.unstubAllGlobals());

describe('screen label schemas', () => {
  it('validates dictionary languages and screen extension references in the real GTS store', () => {
    const plugin = store();
    const nonScreen = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~frontx.mfes.comm.label_probe.v1';
    plugin.register({ id: nonScreen, value: 'en' });
    expect(() => plugin.register(dictionary('en'))).not.toThrow();
    expect(() => plugin.register(dictionary('xx'))).toThrow(/allowed values/);
    expect(() => plugin.register({
      ...dictionary('en'),
      labels: [{ extension: nonScreen, label: 'Widget' }],
    })).toThrow(/does not match pattern/);
  });

  it('keeps the shared language property constrained through the code reference', () => {
    const plugin = store();
    const id = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~frontx.mfes.comm.runtime.v1';
    expect(() => plugin.register({ id, value: 'en' })).not.toThrow();
    expect(() => plugin.register({ id, value: 'xx' })).toThrow(/allowed values/);
  });
});

describe('menu label loading', () => {
  it('resolves files against dev, production, and sub-path MFE roots', () => {
    expect(labelDictionaryUrl('labels/en.json', 'http://localhost:3001/', 'http://localhost:3000/generated-mfe-manifests.json'))
      .toBe('http://localhost:3001/labels/en.json');
    expect(labelDictionaryUrl('labels/en.json', 'mfe/demo-mfe/', 'https://example.com/generated-mfe-manifests.json'))
      .toBe('https://example.com/mfe/demo-mfe/labels/en.json');
    expect(labelDictionaryUrl('labels/en.json', 'mfe/demo-mfe/', 'https://example.com/apps/console/generated-mfe-manifests.json'))
      .toBe('https://example.com/apps/console/mfe/demo-mfe/labels/en.json');
  });

  it('loads only the selected language, caches each file, and leaves absent languages empty', async () => {
    const loader = new MenuLabels(store());
    loader.configure([
      {
        manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }, { language: 'fr', file: 'labels/fr.json' }],
      },
      {
        manifest: { metaData: { publicPath: 'mfe/_blank-mfe/' } },
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
      },
    ], 'https://example.com/apps/console/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/_blank-mfe/')
        ? { ...dictionary('en', 'Blank Home'), labels: [{ extension: blankExtension, label: 'Blank Home' }] }
        : dictionary(url.endsWith('/fr.json') ? 'fr' : 'en', url.endsWith('/fr.json') ? 'Profil' : 'Profile'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const english = await loader.load('en');
    expect(english.get(extension)).toBe('Profile');
    expect(english.get(blankExtension)).toBe('Blank Home');
    expect((await loader.load('fr')).get(extension)).toBe('Profil');
    expect((await loader.load('es')).size).toBe(0);
    await loader.load('en');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['failed fetch', () => ({ ok: false, status: 404, statusText: 'Not Found' })],
    ['invalid dictionary', () => ({ ok: true, json: async () => dictionary('en', '') })],
    ['mismatched language', () => ({ ok: true, json: async () => dictionary('fr') })],
  ])('ignores a %s with one warning', async (_name, response) => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async () => response());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);

    expect((await loader.load('en')).size).toBe(0);
    expect((await loader.load('en')).size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
