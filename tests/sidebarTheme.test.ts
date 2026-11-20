import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('../src/styles/lio.scss', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/styles/layout.scss', import.meta.url), 'utf8');

// The presentation layer must preserve the shell's sidebar and mobile drawer.
describe('sidebar theme layout', () => {
  test('keeps the sidebar containers and navigation groups in the layout', () => {
    expect(theme).not.toContain('display: contents');
    expect(theme).not.toContain('grid-template-columns:');
    expect(theme).not.toContain('flex-direction: row');
    expect(layout).toMatch(/\.nav-section\s*\{[^}]*flex-direction: column/s);
  });

  test('preserves the responsive drawer transform and collapse controls', () => {
    expect(theme).not.toMatch(/\.sidebar\s*\{[^}]*transform: none/s);
    expect(theme).not.toMatch(/\.sidebar-toggle-floating[^{}]*\{\s*display: none/s);
    expect(theme).not.toMatch(/\.mobile-sidebar-actions[^{}]*\{\s*display: none/s);
    expect(layout).toContain('transform: translateX(calc(-100% - 24px))');
    expect(layout).toMatch(/&\.open\s*\{\s*transform: translateX\(0\)/);
  });

  test('keeps content clear of the fixed header, including logs', () => {
    expect(theme).toContain('padding: var(--header-height) $gutter 3rem');
    expect(theme).toContain('padding: var(--header-height) $gutter 1rem');
    expect(theme).toContain('padding: var(--header-height) 12px 0.75rem');
  });
});
