/**
 * Two small FrontX apps for the survey-app.mjs tests of the
 * frontx-design-proposal skill, written into a folder by code, not kept as
 * files, so no stray .tsx joins the template. Both are made up.
 *
 * - writeProposalApp: a side menu app, Team Hub, with Home and Docs on the
 *   kit's own values and no logo. The team-tasks and invite-teammate worked
 *   examples' survey.json is its survey.
 * - writeTopApp: a top header app, Example App, with Home and Docs. It covers
 *   what the survey reads from an app that styles itself: links at the far
 *   end with an underlined active link, a second row of links on a phone, an
 *   SVG logo the header imports, a global box-sizing reset, the screens' own page values over the kit's,
 *   a landing screen with its own larger heading, a section heading and two
 *   coloured bands, an active tab colour, a menu that builds its links as
 *   /?screen=<route> (so the links disagree with the routes), a template
 *   example, a blank scaffold and a package the app does not register. The
 *   account-settings and docs-redesign worked examples' survey.json is its
 *   survey.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import './replace-or-fail.mjs';

const KIT_IMPORT = (names) => `import { ${names.join(', ')} } from '@gears-frontx/ui-kit';\n`;

const screen = (ns, id, label, route, order) => ({
  id: `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~${ns}.${id}.screen.v1`,
  domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
  entry: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~${ns}.${id}.v1`,
  route,
  presentation: { label, icon: 'lucide:file', order },
});

const KIT_THEME = `/* a cut-down kit theme */
:root {
  --radius: 0.625rem;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --text-heading-1-size: 1.25rem;
  --text-heading-1-weight: 600;
  --text-heading-1-tracking: 0px;
  --text-heading-2-size: 1rem;
  --text-body-size: 0.875rem;
  --text-meta-size: 0.75rem;
  --text-kpi-size: 2rem;
  --control-height-md: 2.25rem;
}
:root,
[data-theme='light'] {
  --background: #f1f5f9; --foreground: #0f172a; --card: #ffffff; --muted: #f1f5f9;
  --muted-foreground: #334155; --border: #e2e8f0; --primary: #0065e3; --primary-foreground: #ffffff;
  --secondary-foreground: #0f172a;
  --success-foreground: #047857; --success-soft: #e8f8f1; --warning-foreground: #92400e; --warning-soft: #fff7d6;
  --danger-foreground: #be123c; --danger-soft: #fff1f2; --info: #2563eb; --info-soft: #eaf2ff;
}
[data-theme='dark'] { --background: #0f172a; --foreground: #ffffff; }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --background: #000000; } }
`;

const SIDE_THEME = `export const defaultTheme = {
  id: 'default',
  appearance: 'light',
  default: true,
  variables: {
    '--left-menu': 'var(--foreground)',
    '--left-menu-foreground': 'color-mix(in oklab, var(--background) 70%, var(--foreground))',
    '--left-menu-selected': 'var(--primary)',
    '--left-menu-selected-foreground': 'var(--primary-foreground)',
  },
};
`;

export const FILES = {
  'index.html': '<!doctype html><html><head><title>Team Hub</title></head><body></body></html>\n',
  'DESIGN.md': '# Team Hub design\n',
  'src-app/app/layout/Layout.tsx': "import { Menu } from './Menu';\nexport const Layout = () => (<div><Menu /><main /></div>);\n",
  'src-app/app/themes/default.ts': SIDE_THEME,
  'src-app/app/themes/dark.ts': "export const darkTheme = { id: 'dark', appearance: 'dark', variables: { '--left-menu': '#000000' } };\n",
  'src-app/app/api/AccountsApiService.ts': 'export class AccountsApiService {}\n',
  'src-app/app/api/mocks.ts': 'export const accountMocks = {};\n',
  'src-app/mfe_packages/team-mfe/mfe.json': JSON.stringify({
    entries: [
      { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~team.home.v1', exposedModule: './lifecycle-home' },
      { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~team.docs.v1', exposedModule: './lifecycle-docs' },
    ],
    extensions: [screen('team', 'docs', 'Docs', '/docs', 20), screen('team', 'home', 'Home', '/home', 10)],
  }, null, 2),
  'src-app/mfe_packages/team-mfe/src/lifecycle-home.tsx': "import { HomeScreen } from './screens/home/HomeScreen';\nexport default HomeScreen;\n",
  'src-app/mfe_packages/team-mfe/src/lifecycle-docs.tsx': "import { DocsScreen } from './screens/docs/DocsScreen';\nexport default DocsScreen;\n",
  'src-app/mfe_packages/team-mfe/src/screens/home/HomeScreen.tsx': `${KIT_IMPORT(['Button', 'Card', 'CardContent', 'CardHeader', 'CardTitle'])}import type { CardProps } from '@gears-frontx/ui-kit';\nexport const HomeScreen = () => null;\n`,
  'src-app/mfe_packages/team-mfe/src/screens/docs/DocsScreen.tsx': `${KIT_IMPORT(['Badge', 'Card', 'Input', 'Table', 'TableBody', 'TableCell', 'TableHead', 'TableHeader', 'TableRow'])}export const DocsScreen = () => null;\n`,
  'src-app/mfe_packages/team-mfe/src/screens/docs/DocsScreen.test.tsx': `${KIT_IMPORT(['Dialog'])}\n`,
  'src-app/mfe_packages/team-mfe/src/api/DocsApiService.ts': 'export class DocsApiService {}\n',
  'src-app/mfe_packages/team-mfe/src/api/mocks.ts': 'export const docsMocks = [];\n',
  'src-app/mfe_packages/_blank-mfe/mfe.json': JSON.stringify({ entries: [], extensions: [screen('team', 'blank', 'Blank', '/blank', 1)] }),
  'node_modules/@gears-frontx/ui-kit/dist/theme.css': KIT_THEME,
};

const mfe = (ns, id, screens) => JSON.stringify({
  entries: [{ id: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~${ns}.${id}.v1`, exposedModule: './lifecycle' }],
  extensions: screens.map(([sid, label, route, order]) => ({ ...screen(ns, sid, label, route, order), entry: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~${ns}.${id}.v1` })),
}, null, 2);

export const TOP_FILES = {
  'index.html': '<!doctype html><html><head><title>Example App</title></head><body></body></html>\n',
  'DESIGN.md': '# Example App design\n',
  'DESIGN-RULES.md': '# Design rules\n\nPage state resets on reload.\n',
  'public/generated-mfe-manifests.json': JSON.stringify([
    { manifest: { id: 'example.home.manifest' }, extensions: [{ id: screen('example', 'home', 'Home', '/home', 10).id }] },
    { manifest: { id: 'example.docs.manifest' }, extensions: [{ id: screen('example', 'docs', 'Docs', '/docs', 20).id }] },
  ], null, 2),
  'src-app/app/layout/Layout.tsx': "import { Header } from './Header';\nexport const Layout = () => (<div><Header /><main /></div>);\n",
  'src-app/app/layout/Header.tsx': `import { AppLogoIcon } from '@/app/icons/AppLogoIcon';
import { Menu } from './Menu';
import styles from './Header.module.css';
export const Header = () => (
  <header className={styles.bar}>
    <div className={styles.brand}><AppLogoIcon className={styles.mark} /><span className={styles.name}>Example App</span></div>
    <nav className={styles.navRow}><Menu /></nav>
  </header>
);
`,
  'src-app/app/layout/Header.module.css': `.bar { display: flex; flex-direction: column; justify-content: space-between; padding: 0 16px; }
.brand { display: flex; align-items: center; gap: 10px; height: 52px; }
.mark { width: 26px; height: 26px; color: var(--primary); }
.name { font-size: 17px; font-weight: 700; }
.navRow { height: 44px; }
@media (min-width: 768px) {
  .bar { flex-direction: row; align-items: center; height: 68px; padding: 0 48px; }
}
`,
  'src-app/app/layout/Menu.tsx': `import styles from './Menu.module.css';
export const Menu = ({ items }: { items: { route: string; label: string; active: boolean }[] }) => (
  <ul className={styles.list}>
    {items.map(({ route, label, active }) => (
      <li key={route}><a className={styles.link} data-active={active} href={\`/?screen=\${route.replace(/^\\//, '')}\`}>{label}</a></li>
    ))}
  </ul>
);
`,
  'src-app/app/layout/Menu.module.css': `.list { display: flex; gap: 22px; }
.link { position: relative; font-size: 14px; color: #1d2433; }
.link[data-active='true'] { color: #2f6fd6; }
.link[data-active='true']::after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: #2f6fd6; }
`,
  'src-app/app/icons/AppLogoIcon.tsx': `export const AppLogoIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <path d="M4 4h24v24H4z" opacity="0.3" />
    <path d="M10 10h12v12H10z" />
  </svg>
);
`,
  'src-app/app/globals.css': '*,\n::before,\n::after {\n  box-sizing: border-box;\n}\n',
  'src-app/app/themes/default.ts': `export const defaultTheme = {
  id: 'default',
  appearance: 'light',
  default: true,
  variables: {
    '--left-menu': '#1d2433',
    '--left-menu-foreground': '#e4e7ee',
    '--left-menu-selected': '#2f6fd6',
    '--left-menu-selected-foreground': '#ffffff',
  },
};
`,
  'src-app/app/themes/dark.ts': "export const darkTheme = { id: 'dark', appearance: 'dark', variables: { '--left-menu': '#000000' } };\n",
  'src-app/app/api/AccountsApiService.ts': 'export class AccountsApiService {}\n',
  'src-app/app/api/mocks.ts': 'export const accountMocks = {};\n',
  'src-app/mfe_packages/home-mfe/mfe.json': mfe('example', 'home', [['home', 'Home', '/home', 10]]),
  'src-app/mfe_packages/home-mfe/src/lifecycle.tsx': "import { HomeScreen } from './screens/home/HomeScreen';\nexport default HomeScreen;\n",
  'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.tsx': `${KIT_IMPORT(['Badge', 'Button', 'Card', 'CardContent', 'Field', 'FieldLabel', 'Input', 'Label', 'Select', 'Switch'])}import styles from './HomeScreen.module.css';\nexport const HomeScreen = () => null;\n`,
  'src-app/mfe_packages/home-mfe/src/screens/home/HomeScreen.module.css': `.root {
  --primary: #2f6fd6; --primary-foreground: #ffffff; --foreground: #1d2433; --muted-foreground: #5b6475;
  --border: #dfe3ea; --card: #ffffff;
  background-color: #ffffff;
}
.column { max-width: 1240px; padding: 0 20px; }
.hero { background-color: var(--primary); color: var(--primary-foreground); }
.heroTitle { font-size: 40px; font-weight: 700; }
.sectionTitle { font-size: 28px; }
.closing { background-color: #1d2433; color: #ffffff; }
.cardTitle { font-size: 20px; }
.body { font-size: 15px; }
.label { font-size: 12px; }
.cta { --control-height-lg: 44px; --radius-lg: 8px; }
@media (min-width: 1024px) {
  .column { padding: 0 64px; }
  .heroTitle { font-size: 60px; }
  .sectionTitle { font-size: 40px; }
}
`,
  'src-app/mfe_packages/docs-mfe/mfe.json': mfe('example', 'docs', [['docs', 'Docs', '/docs', 20]]),
  'src-app/mfe_packages/docs-mfe/src/lifecycle.tsx': "import { DocsScreen } from './screens/docs/DocsScreen';\nexport default DocsScreen;\n",
  'src-app/mfe_packages/docs-mfe/src/screens/docs/DocsScreen.tsx': `${KIT_IMPORT(['Button', 'Card', 'Table', 'TableBody', 'TableCell', 'TableHead', 'TableHeader', 'TableRow', 'Tabs', 'TabsList', 'TabsTrigger'])}import styles from './DocsScreen.module.css';\nexport const DocsScreen = () => null;\n`,
  'src-app/mfe_packages/docs-mfe/src/screens/docs/DocsScreen.module.css': `.root { background-color: #ffffff; }
.pageHead { padding-top: 40px; }
.pageTitle { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; }
.pageLead { font-size: 16px; }
.card { border-radius: 12px; }
.tabsList .tabTrigger[data-active] { color: var(--primary); }
@media (min-width: 1024px) {
  .pageHead { padding-top: 56px; }
  .pageTitle { font-size: 48px; }
}
`,
  'src-app/mfe_packages/demo-mfe/mfe.json': mfe('example', 'demo', [['hello', 'Hello World', '/hello-world', 1], ['profile', 'Profile', '/profile', 2]]).replaceOrFail('{\n', '{\n  "templateExample": true,\n'),
  'src-app/mfe_packages/drafts-mfe/mfe.json': mfe('example', 'drafts', [['drafts', 'Drafts', '/drafts', 30]]),
  'src-app/mfe_packages/_blank-mfe/mfe.json': mfe('example', 'blank', [['blank', 'Blank Home', '/blank-home', 1]]),
  'node_modules/@gears-frontx/ui-kit/dist/theme.css': KIT_THEME,
  'node_modules/@gears-frontx/ui-kit/dist/chunks/table.css': '._tableHead_a1 { text-transform: uppercase; font-size: 0.75rem; }\n',
};

/** Writes the files into `root` and returns it. */
function writeFiles(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** Writes the side menu app into `root` and returns it. */
export const writeProposalApp = (root) => writeFiles(root, FILES);

/** Writes the top header app into `root` and returns it. */
export const writeTopApp = (root) => writeFiles(root, TOP_FILES);
