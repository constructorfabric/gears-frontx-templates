/**
 * `ChunkSyntaxMemo` — what a run reads out of an emitted chunk's text,
 * parsed once per chunk file: the relative specifiers it imports, its
 * classified dynamic imports and the names it exports. One chunk is
 * read by every fetch list that emits it and by the package record;
 * the text of a staged chunk does not change once it is shaped.
 */

import * as fs from 'node:fs';

import { DynamicImportClassifier, type ClassifiedImport } from './DynamicImportClassifier';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import { UnitExportNames } from './UnitExportNames';

interface ChunkSyntax {
  relativeSpecifiers?: string[];
  dynamicImports?: ClassifiedImport[];
  exportNames?: { names: string[] | undefined };
}

export class ChunkSyntaxMemo {
  private readonly syntax = new Map<string, ChunkSyntax>();
  private readonly texts = new Map<string, string>();

  /**
   * The relative specifiers (`./…`, `../…`) of the chunk's static
   * imports, `export … from` statements and literal dynamic imports.
   * Throws when the text cannot be parsed.
   */
  relativeSpecifiers(file: string, unit: string): string[] {
    const entry = this.entry(file);
    if (entry.relativeSpecifiers === undefined) {
      const statements = ModuleLinkageScanner.statements(this.text(file), unit);
      if (statements === undefined) throw ChunkSyntaxMemo.unparseable(unit);
      entry.relativeSpecifiers = [
        ...statements.map((stmt) => stmt.specifier),
        ...this.dynamicImports(file, unit).flatMap((call) =>
          call.kind === 'literal' ? [call.specifier] : []
        ),
      ].filter((spec) => spec.startsWith('./') || spec.startsWith('../'));
    }
    return entry.relativeSpecifiers;
  }

  /** Every `import(...)` call site of the chunk, classified. */
  dynamicImports(file: string, unit: string): ClassifiedImport[] {
    const entry = this.entry(file);
    entry.dynamicImports ??= DynamicImportClassifier.classify(this.text(file), unit);
    return entry.dynamicImports;
  }

  /**
   * The names the chunk exports; `undefined` when not statically known.
   * Throws when the text cannot be parsed.
   */
  exportNames(file: string, unit: string): string[] | undefined {
    const entry = this.entry(file);
    entry.exportNames ??= { names: UnitExportNames.of(this.text(file), unit) };
    return entry.exportNames.names;
  }

  private text(file: string): string {
    let text = this.texts.get(file);
    if (text === undefined) {
      text = fs.readFileSync(file, 'utf-8');
      this.texts.set(file, text);
    }
    return text;
  }

  private entry(file: string): ChunkSyntax {
    let entry = this.syntax.get(file);
    if (entry === undefined) {
      entry = {};
      this.syntax.set(file, entry);
    }
    return entry;
  }

  private static unparseable(unit: string): Error {
    return new Error(
      `[unit-producer] the text of unit "${unit}" cannot be parsed to read ` +
        `the specifiers it imports`
    );
  }
}
