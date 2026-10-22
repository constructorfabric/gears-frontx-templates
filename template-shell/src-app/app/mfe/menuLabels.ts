import { gtsPlugin } from '@gears-frontx/react';

export interface LabelDictionaryManifest {
  language: string;
  file: string;
}

interface LabelSource {
  manifest: { metaData: { publicPath: string } };
  extensions?: Array<{ id: string }>;
  labelDictionaries?: LabelDictionaryManifest[];
}

interface ScreenLabels {
  type: string;
  language: string;
  labels: Array<{ extension: string; label: string }>;
}

export function labelDictionaryUrl(file: string, publicPath: string, aggregateUrl: string): string {
  return new URL(file, new URL(publicPath, aggregateUrl)).href;
}

export class MenuLabels {
  private sources: readonly LabelSource[] = [];
  private aggregateUrl = '';
  private readonly cache = new Map<string, Promise<ScreenLabels | null>>();

  constructor(private readonly typeSystem: Pick<typeof gtsPlugin, 'register'>) {}

  configure(sources: readonly LabelSource[], aggregateUrl: string): void {
    this.sources = sources;
    this.aggregateUrl = aggregateUrl;
    this.cache.clear();
  }

  async load(language: string): Promise<Map<string, string>> {
    const dictionaries = this.sources.flatMap((source) => {
      const owned = new Set((source.extensions ?? []).map(({ id }) => id));
      return (Array.isArray(source.labelDictionaries) ? source.labelDictionaries : [])
        .filter((dictionary) => dictionary?.language === language)
        .map(async (dictionary) => {
          const labels = (await this.fetchOnce(language, dictionary.file, source.manifest.metaData.publicPath))?.labels ?? [];
          return labels.filter(({ extension }) => owned.has(extension));
        });
    });
    const results = await Promise.all(dictionaries);
    return new Map(results.flat().map(({ extension, label }) => [extension, label] as const));
  }

  private fetchOnce(language: string, file: string, publicPath: string): Promise<ScreenLabels | null> {
    const key = JSON.stringify([language, publicPath, file]);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = (async () => {
        let url = file;
        try {
          url = labelDictionaryUrl(file, publicPath, this.aggregateUrl);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const dictionary = (await response.json()) as ScreenLabels;
          if (dictionary.type !== 'gts.frontx.i18n.dict.screen_labels.v1~') throw new Error('unexpected dictionary type');
          if (dictionary.language !== language) throw new Error('dictionary language does not match manifest');
          this.typeSystem.register(dictionary);
          return dictionary;
        } catch (error) {
          console.warn(`[Menu labels] Ignoring ${url}:`, error);
          return null;
        }
      })();
      this.cache.set(key, pending);
    }
    return pending;
  }
}

export const menuLabels = new MenuLabels(gtsPlugin);
