import { gtsPlugin } from '@gears-frontx/react';
import { languageCodeSchema, screenLabelsSchema } from '@gears-frontx/frontx-template-shell';

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
  private readonly cache = new Map<string, Promise<ScreenLabels | null | undefined>>();
  private readonly resolved = new Map<string, Map<string, string>>();
  private generation = 0;

  constructor(private typeSystem: Pick<typeof gtsPlugin, 'register' | 'registerSchema'>) {}

  configure(sources: readonly LabelSource[], aggregateUrl: string, typeSystem = this.typeSystem): void {
    this.typeSystem = typeSystem;
    this.typeSystem.registerSchema(languageCodeSchema);
    this.typeSystem.registerSchema(screenLabelsSchema);
    this.sources = sources;
    this.aggregateUrl = aggregateUrl;
    this.cache.clear();
    this.resolved.clear();
    this.generation += 1;
  }

  peek(language: string): Map<string, string> | undefined {
    return this.resolved.get(language);
  }

  async load(language: string): Promise<Map<string, string>> {
    const generation = this.generation;
    let complete = true;
    const dictionaries = this.sources.flatMap((source) => {
      const owned = new Set((source.extensions ?? []).map(({ id }) => id));
      return (Array.isArray(source.labelDictionaries) ? source.labelDictionaries : [])
        .filter((dictionary) => dictionary?.language === language)
        .map(async (dictionary) => {
          const result = await this.fetchOnce(language, dictionary.file, source.manifest.metaData.publicPath);
          if (result === undefined) complete = false;
          return (result?.labels ?? []).filter(({ extension }) => owned.has(extension));
        });
    });
    const results = await Promise.all(dictionaries);
    const labels = new Map(results.flat().map(({ extension, label }) => [extension, label] as const));
    if (complete && generation === this.generation) this.resolved.set(language, labels);
    return labels;
  }

  private fetchOnce(language: string, file: string, publicPath: string): Promise<ScreenLabels | null | undefined> {
    const key = JSON.stringify([language, publicPath, file]);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = (async () => {
        let url = file;
        let retry = false;
        try {
          url = labelDictionaryUrl(file, publicPath, this.aggregateUrl);
          const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((error: unknown) => {
            retry = true;
            throw error;
          });
          if (!response.ok) {
            retry = response.status >= 500;
            throw new Error(`${response.status} ${response.statusText}`);
          }
          const dictionary = (await response.json()) as ScreenLabels;
          if (dictionary.type !== 'gts.frontx.i18n.dict.screen_labels.v1~') throw new Error('unexpected dictionary type');
          if (dictionary.language !== language) throw new Error('dictionary language does not match manifest');
          const clean = {
            type: dictionary.type,
            language: dictionary.language,
            labels: dictionary.labels.map(({ extension, label }) => ({ extension, label })),
          };
          this.typeSystem.register(clean);
          return clean;
        } catch (error) {
          retry ||= ['TimeoutError', 'AbortError'].includes((error as Error | null)?.name ?? '');
          if (retry && this.cache.get(key) === pending) this.cache.delete(key);
          console.warn(`[Menu labels] Ignoring ${url}:`, error);
          return retry ? undefined : null;
        }
      })();
      this.cache.set(key, pending);
    }
    return pending;
  }
}

export const menuLabels = new MenuLabels(gtsPlugin);
