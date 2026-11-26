/**
 * Barrel split (`framework_barrel_split`, `framework_mfe_plugin_placement`)
 * and type-system agnosticism (`gts_out_of_framework`).
 *
 * Nothing the `@gears-frontx/framework` main barrel exports reaches
 * `@gears-frontx/mfes` at runtime: every `@gears-frontx/mfes` re-export
 * (registry factory, mount strategies, bridge classes, MFE types, utilities)
 * and the MFE host plugin `microfrontends()` with its actions, selectors and
 * state types live on the `@gears-frontx/framework/mfe` subpath.
 * `TestContainerProvider` reaches the MFE runtime and is exported only from
 * `@gears-frontx/framework/testing`.
 *
 * The package is type-system agnostic: it depends only on the abstract
 * `TypeSystemPlugin` contract. No entry reaches `@gears-frontx/gts-plugin`,
 * there is no `/gts` subpath, and no source file imports a concrete type
 * system or the application template or carries a GTS-notation ID — the GTS
 * type system, its IDs and the domain declarations belong to the shell's `src/` directory.
 *
 * The package's own tests hold to the same rule: they run against a
 * test-local stand-in type system, so no test source imports or mocks either
 * package above or carries a GTS-notation ID.
 *
 * Each entry's RUNTIME import graph is walked — on the sources and on the
 * built output, where other `@gears-frontx/*` packages are followed into
 * their built entries — so a re-export through another package counts.
 * Type-only imports are erased by the compiler and do not count.
 *
 * The assertions read the files directly rather than importing the entries at
 * runtime: the split is a static property of each entry's import graph, so
 * walking that graph is the faithful check.
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const FRAMEWORK_MFE = '@gears-frontx/framework/mfe';
const MFES = '@gears-frontx/mfes';
const GTS_PLUGIN = '@gears-frontx/gts-plugin';
/** The shell's own `src/` modules (GTS vocabulary, layout domain, mock plugins). */
const TEMPLATE_SRC = path.resolve(packageDir, '..', '..', 'src');

/** Specifiers of the MFE side (`/mfe` and what it re-exports). */
const MFE_SIDE = [FRAMEWORK_MFE, MFES];
/** Specifiers of a concrete type system. */
const GTS_SIDE = [GTS_PLUGIN];

/** A GTS-notation ID (`gts.<vendor>.<package>…`) anywhere in a file. */
const GTS_ID = /\bgts\.[a-z0-9_]+\./;

/** Package scope whose built entries the cross-package walk follows. */
const FOLLOWED_SCOPE = '@gears-frontx/';

/** Read a file under the package root, throwing a clear message when absent. */
function read(relative: string): string {
  const file = path.join(packageDir, relative);
  if (!fs.existsSync(file)) {
    throw new Error(`${relative} not found — build the framework package first.`);
  }
  return fs.readFileSync(file, 'utf-8');
}

/**
 * Module specifiers a file imports or re-exports AT RUNTIME: `import type`,
 * `export type` and clauses whose every specifier is `type`-qualified are
 * erased by the compiler and skipped; dynamic `import()` calls count.
 */
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause !== undefined &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** Resolve a relative specifier to a file of the walked tree. */
function resolveRelative(fromFile: string, specifier: string, extensions: readonly string[]): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (found === undefined) {
    throw new Error(`cannot resolve ${specifier} from ${fromFile}`);
  }
  return found;
}

/** The ESM target of an `exports` entry (`import` → `module` → `default`). */
function esmTarget(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (entry === null || typeof entry !== 'object') return undefined;
  const conditions = entry as Record<string, unknown>;
  for (const condition of ['import', 'module', 'default']) {
    if (condition in conditions) {
      const target = esmTarget(conditions[condition]);
      if (target !== undefined) return target;
    }
  }
  return undefined;
}

/**
 * Resolve a bare package specifier to the built ESM file it loads, the way
 * Node does from `fromFile`: the nearest `node_modules/<name>` up the tree,
 * then the package's `exports` map (or `module`/`main` for the root).
 */
function resolvePackage(fromFile: string, specifier: string): string {
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  const name = parts.slice(0, nameLength).join('/');
  const subpath = parts.length > nameLength ? `./${parts.slice(nameLength).join('/')}` : '.';
  let directory = path.dirname(fromFile);
  for (;;) {
    const manifestFile = path.join(directory, 'node_modules', name, 'package.json');
    if (fs.existsSync(manifestFile)) {
      const root = fs.realpathSync(path.dirname(manifestFile));
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as {
        exports?: Record<string, unknown> | string;
        module?: string;
        main?: string;
      };
      let target: string | undefined;
      if (typeof manifest.exports === 'string') {
        target = subpath === '.' ? manifest.exports : undefined;
      } else if (manifest.exports !== undefined) {
        target = esmTarget(manifest.exports[subpath]);
      } else if (subpath === '.') {
        target = manifest.module ?? manifest.main;
      }
      if (target === undefined) {
        throw new Error(`${specifier} is not exported by ${name}`);
      }
      const file = path.join(root, target);
      if (!fs.existsSync(file)) {
        throw new Error(`${specifier} resolves to ${file}, which is not built`);
      }
      return file;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`cannot resolve package ${specifier} from ${fromFile}`);
    }
    directory = parent;
  }
}

/** True when a relative `specifier` written in `file` lands in the shell's `src/`. */
function reachesTemplateSource(file: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return false;
  const target = path.resolve(path.dirname(file), specifier);
  return target === TEMPLATE_SRC || target.startsWith(`${TEMPLATE_SRC}${path.sep}`);
}

/** True when `specifier` is, or is a subpath of, one of `roots`. */
function isUnder(specifier: string, roots: readonly string[]): boolean {
  return roots.some((root) => specifier === root || specifier.startsWith(`${root}/`));
}

/**
 * Every bare (package) specifier the entry's runtime import graph reaches,
 * following relative imports transitively. With `crossPackages`,
 * `@gears-frontx/*` specifiers are also followed into the built ESM file they
 * resolve to — except `stopAt` ones, which are recorded but not entered
 * (reaching them is already the finding).
 */
function reachedPackages(
  entryRelative: string,
  extensions: readonly string[],
  options: { crossPackages?: boolean; stopAt?: readonly string[] } = {},
): Set<string> {
  const entry = path.join(packageDir, entryRelative);
  if (!fs.existsSync(entry)) {
    throw new Error(`${entryRelative} not found — build the framework package first.`);
  }
  const stopAt = options.stopAt ?? [];
  const seen = new Set<string>();
  const reached = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeSpecifiers(file)) {
      if (specifier.startsWith('.')) {
        queue.push(resolveRelative(file, specifier, file.endsWith('.js') ? DIST_EXTENSIONS : extensions));
        continue;
      }
      reached.add(specifier);
      if (options.crossPackages && specifier.startsWith(FOLLOWED_SCOPE) && !isUnder(specifier, stopAt)) {
        queue.push(resolvePackage(file, specifier));
      }
    }
  }
  return reached;
}

/** Reached specifiers under any of `roots`. */
function reachesAny(reached: Set<string>, roots: readonly string[]): string[] {
  return [...reached].filter((specifier) => isUnder(specifier, roots));
}

/** Names exported from a source file's `export { ... }` blocks. */
function exportsOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const item of match[1]!.split(',')) {
      const trimmed = item.replace(/\/\/[^\n]*/g, '').replace(/^\s*type\s+/, '').trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/\bas\s+(\w[\w$]*)$/);
      names.add(asMatch ? asMatch[1]! : trimmed);
    }
  }
  return names;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx'] as const;
const DIST_EXTENSIONS = ['.js'] as const;

/** Symbols on `/mfe`: the MFE runtime re-exports and the MFE host plugin. */
const MFE_SYMBOLS = [
  'MfeHandlerMF',
  'mfeRegistryFactory',
  'ChildMfeBridge',
  'MfeRegistry',
  'ActionHandler',
  'createShadowRoot',
  'injectCssVariables',
  'microfrontends',
  'MicrofrontendsConfig',
  'loadExtension',
  'mountExtension',
  'unmountExtension',
  'registerExtension',
  'unregisterExtension',
  'selectExtensionState',
  'selectRegisteredExtensions',
  'selectExtensionError',
  'MfeState',
  'ExtensionRegistrationState',
  'RegisterExtensionPayload',
  'UnregisterExtensionPayload',
];

/**
 * GTS symbols this package no longer exports from any entry: the GTS type
 * system re-exports, the template's GTS IDs and its base domain declarations
 * (all owned by the application template now), and the GTS ID utility of
 * `@gears-frontx/mfes`.
 */
const GTS_SYMBOLS = [
  'gtsPlugin',
  'FRONTX_ACTION_LOAD_EXT',
  'FRONTX_ACTION_MOUNT_EXT',
  'FRONTX_ACTION_UNMOUNT_EXT',
  'JSONSchema',
  'screenDomain',
  'sidebarDomain',
  'popupDomain',
  'overlayDomain',
  'FRONTX_SCREEN_DOMAIN',
  'FRONTX_SIDEBAR_DOMAIN',
  'FRONTX_POPUP_DOMAIN',
  'FRONTX_OVERLAY_DOMAIN',
  'FRONTX_MFE_ENTRY_MF',
  'FRONTX_SCREEN_EXTENSION_TYPE',
  'FRONTX_SHARED_PROPERTY_THEME',
  'FRONTX_SHARED_PROPERTY_LANGUAGE',
];

/** Every file under `src/`, tests excluded. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (!/\.test\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(path.join(packageDir, 'src'));
  return files;
}

/** This guard's own file: it names the forbidden specifiers in order to look for them. */
const GUARD_FILE = fileURLToPath(import.meta.url);

/**
 * Every test source of the package — each file under a `__tests__` directory
 * (helpers and stand-ins included) and every `*.test.*` file under `src/` —
 * this guard excluded.
 */
function testSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string, underTests: boolean): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full, underTests || entry.name === '__tests__');
      } else if (
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        (underTests || /\.test\.[cm]?[jt]sx?$/.test(entry.name)) &&
        full !== GUARD_FILE
      ) {
        files.push(full);
      }
    }
  };
  walk(path.join(packageDir, '__tests__'), true);
  walk(path.join(packageDir, 'src'), false);
  return files;
}

/**
 * Every string literal of a file: the specifiers of static, dynamic and
 * type-level imports, and the targets of `vi.mock` and the like, all count.
 */
function stringLiterals(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
  const literals: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) literals.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

/** Every module specifier a source file imports or re-exports, type-only included. */
function allSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/**
 * Layout symbols this package no longer exports from any entry: the layout
 * plugin, its slices, actions, state types and payloads, and the layout
 * state accessors (`no_business_logic_in_packages`). The application
 * template owns its layout.
 */
const LAYOUT_SYMBOLS = [
  'layout',
  'layoutReducer',
  'layoutDomainReducers',
  'LAYOUT_SLICE_NAME',
  'headerSlice',
  'footerSlice',
  'menuSlice',
  'sidebarSlice',
  'popupSlice',
  'overlaySlice',
  'headerActions',
  'footerActions',
  'menuActions',
  'sidebarActions',
  'popupActions',
  'overlayActions',
  'setUser',
  'setHeaderLoading',
  'clearUser',
  'setFooterVisible',
  'setFooterConfig',
  'toggleMenu',
  'setMenuCollapsed',
  'setMenuItems',
  'setMenuVisible',
  'setMenuConfig',
  'toggleSidebar',
  'setSidebarCollapsed',
  'setSidebarPosition',
  'setSidebarTitle',
  'setSidebarContent',
  'setSidebarVisible',
  'setSidebarWidth',
  'setSidebarConfig',
  'openPopup',
  'closePopup',
  'closeTopPopup',
  'closeAllPopups',
  'showOverlay',
  'hideOverlay',
  'setOverlayVisible',
  'PopupSliceState',
  'HeaderUser',
  'HeaderState',
  'HeaderConfig',
  'FooterState',
  'FooterConfig',
  'MenuItem',
  'MenuState',
  'SidebarPosition',
  'SidebarState',
  'PopupState',
  'PopupConfig',
  'OverlayState',
  'OverlayConfig',
  'LayoutState',
  'LayoutDomainState',
  'RootStateWithLayout',
  'LayoutDomainReducers',
  'ShowPopupPayload',
  'getLayoutDomainState',
  'hasNewLayoutState',
];

/**
 * Tenant symbols this package no longer exports from any entry: the tenant
 * slice, its actions, effects, events, payloads and state types. Nothing in
 * the framework tracks a tenant.
 */
const TENANT_SYMBOLS = [
  'TENANT_SLICE_NAME',
  'tenantSlice',
  'tenantActions',
  'tenantReducer',
  'setTenant',
  'setTenantLoading',
  'clearTenant',
  'initTenantEffects',
  'TenantEvents',
  'TenantChangedPayload',
  'TenantClearedPayload',
  'changeTenant',
  'clearTenantAction',
  'setTenantLoadingState',
  'Tenant',
  'TenantState',
];

/**
 * Screen extension types this package does not export from any entry: the
 * screen domain's derived extension type and its presentation metadata. The
 * application template owns its screen extension type.
 */
const SCREEN_SYMBOLS = ['ScreenExtension', 'ExtensionPresentation'];

/** Symbols on `/testing` only (they reach the MFE runtime). */
const TESTING_ONLY_SYMBOLS = ['TestContainerProvider', 'TestStrategyFactory'];

describe('@gears-frontx/framework barrel split', () => {
  describe('main barrel', () => {
    it('src/index.ts exports none of the /mfe, GTS or testing-only symbols', () => {
      const names = exportsOf(read('src/index.ts'));
      for (const name of [...MFE_SYMBOLS, ...GTS_SYMBOLS, ...TESTING_ONLY_SYMBOLS]) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('src/index.ts exports none of the layout symbols', () => {
      const names = exportsOf(read('src/index.ts'));
      for (const name of LAYOUT_SYMBOLS) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('src/index.ts exports none of the tenant symbols', () => {
      const names = exportsOf(read('src/index.ts'));
      for (const name of TENANT_SYMBOLS) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('src/index.ts exports none of the screen extension symbols', () => {
      const names = exportsOf(read('src/index.ts'));
      for (const name of SCREEN_SYMBOLS) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('src/index.ts still exports the React/plugins surface', () => {
      const names = exportsOf(read('src/index.ts'));
      for (const name of [
        'createFrontX',
        'presets',
        'full',
        'FullPresetConfig',
        'themes',
        'effects',
        'mock',
        'queryCacheShared',
        'resetSharedQueryClient',
      ]) {
        expect(names.has(name), name).toBe(true);
      }
    });

    it('the source runtime graph reaches neither the MFE runtime nor a type system', () => {
      const reached = reachedPackages('src/index.ts', SOURCE_EXTENSIONS);
      expect(reachesAny(reached, [...MFE_SIDE, ...GTS_SIDE])).toEqual([]);
    });

    it('the built runtime graph, across packages, reaches neither the MFE runtime nor a type system', () => {
      const reached = reachedPackages('dist/index.js', DIST_EXTENSIONS, {
        crossPackages: true,
        stopAt: [...MFE_SIDE, ...GTS_SIDE],
      });
      expect(reachesAny(reached, [...MFE_SIDE, ...GTS_SIDE])).toEqual([]);
    });
  });

  describe('/mfe subpath', () => {
    it('src/mfe.ts exports none of the screen extension symbols', () => {
      const names = exportsOf(read('src/mfe.ts'));
      for (const name of SCREEN_SYMBOLS) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('src/mfe.ts exports the MFE symbols and none of the GTS symbols', () => {
      const names = exportsOf(read('src/mfe.ts'));
      for (const name of MFE_SYMBOLS) {
        expect(names.has(name), name).toBe(true);
      }
      for (const name of GTS_SYMBOLS) {
        expect(names.has(name), name).toBe(false);
      }
    });

    it('the source runtime graph does not reach a type system', () => {
      const reached = reachedPackages('src/mfe.ts', SOURCE_EXTENSIONS);
      expect(reachesAny(reached, GTS_SIDE)).toEqual([]);
    });

    it('the built runtime graph, across packages, does not reach a type system', () => {
      const reached = reachedPackages('dist/mfe.js', DIST_EXTENSIONS, {
        crossPackages: true,
        stopAt: GTS_SIDE,
      });
      expect(reached.has(MFES)).toBe(true);
      expect(reachesAny(reached, GTS_SIDE)).toEqual([]);
    });
  });

  describe('type-system agnostic', () => {
    it('has no /gts subpath', () => {
      const manifest = JSON.parse(read('package.json')) as { exports: Record<string, unknown> };
      expect(Object.keys(manifest.exports)).not.toContain('./gts');
      expect(fs.existsSync(path.join(packageDir, 'src/gts.ts'))).toBe(false);
    });

    it('no source file imports the GTS plugin or the application template', () => {
      const offenders = sourceFiles()
        .filter((file) => /\.tsx?$/.test(file))
        .flatMap((file) =>
          allSpecifiers(file)
            .filter(
              (specifier) =>
                isUnder(specifier, GTS_SIDE) || reachesTemplateSource(file, specifier),
            )
            .map((specifier) => `${path.relative(packageDir, file)} -> ${specifier}`),
        );
      expect(offenders).toEqual([]);
    });

    it('no source file carries a GTS-notation ID', () => {
      const offenders = sourceFiles()
        .filter((file) => GTS_ID.test(fs.readFileSync(file, 'utf-8')))
        .map((file) => path.relative(packageDir, file));
      expect(offenders).toEqual([]);
    });

    it('no test source imports or mocks the GTS plugin or the application template', () => {
      const files = testSourceFiles();
      expect(files.length).toBeGreaterThan(0);
      const offenders = files.flatMap((file) =>
        stringLiterals(file)
          .filter(
            (literal) => isUnder(literal, GTS_SIDE) || reachesTemplateSource(file, literal),
          )
          .map((literal) => `${path.relative(packageDir, file)} -> ${literal}`),
      );
      expect(offenders).toEqual([]);
    });

    it('no test source carries a GTS-notation ID', () => {
      const offenders = testSourceFiles()
        .filter((file) => GTS_ID.test(fs.readFileSync(file, 'utf-8')))
        .map((file) => path.relative(packageDir, file));
      expect(offenders).toEqual([]);
    });

    it('no built entry exports a GTS symbol', () => {
      for (const entry of ['dist/index.d.ts', 'dist/mfe.d.ts', 'dist/testing.d.ts', 'dist/types.d.ts']) {
        const names = exportsOf(read(entry));
        for (const name of GTS_SYMBOLS) {
          expect(names.has(name), `${entry}: ${name}`).toBe(false);
        }
      }
    });

  });

  describe('layout ownership', () => {
    it('no built entry exports a layout symbol', () => {
      for (const entry of ['dist/index.d.ts', 'dist/mfe.d.ts', 'dist/testing.d.ts', 'dist/types.d.ts']) {
        const names = exportsOf(read(entry));
        for (const name of LAYOUT_SYMBOLS) {
          expect(names.has(name), `${entry}: ${name}`).toBe(false);
        }
      }
    });
  });

  describe('screen extension ownership', () => {
    it('no built entry exports a screen extension symbol', () => {
      for (const entry of ['dist/index.d.ts', 'dist/mfe.d.ts', 'dist/testing.d.ts', 'dist/types.d.ts']) {
        const names = exportsOf(read(entry));
        for (const name of SCREEN_SYMBOLS) {
          expect(names.has(name), `${entry}: ${name}`).toBe(false);
        }
      }
    });
  });

  describe('tenant removal', () => {
    it('no built entry exports a tenant symbol', () => {
      for (const entry of ['dist/index.d.ts', 'dist/mfe.d.ts', 'dist/testing.d.ts', 'dist/types.d.ts']) {
        const names = exportsOf(read(entry));
        for (const name of TENANT_SYMBOLS) {
          expect(names.has(name), `${entry}: ${name}`).toBe(false);
        }
      }
    });
  });

  describe('/testing subpath', () => {
    it('src/testing.ts exports the testing-only symbols', () => {
      const names = exportsOf(read('src/testing.ts'));
      for (const name of TESTING_ONLY_SYMBOLS) {
        expect(names.has(name), name).toBe(true);
      }
    });
  });
});
