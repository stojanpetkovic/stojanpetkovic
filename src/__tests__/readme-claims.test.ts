import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The README makes checkable promises, and a README is where somebody decides
 * whether to trust the theme. Three of them had quietly stopped being true:
 * it told people to install pnpm 9.x when `packageManager` says 10.33.0, and
 * two version badges named releases behind the ones in `package.json`.
 *
 * `component-count.test.ts` already guards the component figure. This covers
 * the rest of what can be compared against the repository itself.
 */
const root = new URL('../../', import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, root)), 'utf8');

const readme = read('README.md');
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines: { node: string };
  packageManager: string;
};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

/** "1.2.3", "^1.2.3", ">=1.2.3" → "1.2" */
const majorMinor = (range: string) => range.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');

describe('what the README claims', () => {
  it('documents only commands that exist', () => {
    const documented = [...readme.matchAll(/\| `pnpm ([a-z:]+)`/g)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);
    const missing = documented.filter((name) => !(name in pkg.scripts));
    expect(missing, `documented but not a script: ${missing.join(', ')}`).toEqual([]);
  });

  it('asks for the Node version the engines field asks for', () => {
    const claimed = /- \*\*Node\.js ([\d.]+)\+?\*\*/.exec(readme)?.[1];
    expect(claimed).toBeDefined();
    expect(claimed).toBe(pkg.engines.node.replace(/^[^\d]*/, ''));
  });

  it('asks for the pnpm version packageManager pins', () => {
    const claimed = /- \*\*pnpm ([\d.]+)\*\*/.exec(readme)?.[1];
    expect(claimed).toBeDefined();
    expect(claimed).toBe(pkg.packageManager.split('@')[1]);
  });

  it.each([
    ['Astro', 'astro'],
    ['Tailwind', 'tailwindcss'],
    ['TypeScript', 'typescript'],
  ])('badges %s at the version package.json declares', (badge, dep) => {
    const shown = new RegExp(`badge/${badge}-([\\d.]+)-`).exec(readme)?.[1];
    expect(shown, `no ${badge} badge found`).toBeDefined();
    expect(shown).toBe(majorMinor(deps[dep]));
  });
});
