import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { tokens } from '../tokens.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const css = await readFile(path.join(root, 'tokens.css'), 'utf8');
const typescript = await readFile(path.join(root, 'tokens.ts'), 'utf8');

function parseCssCustomProperties(source) {
  const declarations = [...source.matchAll(/(--[a-z][a-z0-9-]*)\s*:\s*([^;{}]+);/g)]
    .map((match) => ({ name: match[1], value: match[2].trim() }));
  const effective = new Map();
  for (const declaration of declarations) effective.set(declaration.name, declaration.value);
  return { declarations, effective };
}

const { declarations, effective: cssTokens } = parseCssCustomProperties(css);

const expectedCssGroups = {
  colors: [
    'bg', 'bg-surface', 'bg-surface2', 'bg-surface3', 'bg-elevated',
    'border', 'border-muted', 'border-bright', 'text', 'text-soft',
    'text-secondary', 'text-muted', 'text-dim', 'accent', 'accent-dim',
    'accent-surface', 'accent-border', 'blue', 'blue-dim', 'purple',
    'purple-dim', 'on-accent', 'danger', 'danger-dim', 'danger-border',
    'warning', 'warning-dim', 'warning-border', 'success', 'success-dim',
    'success-border', 'info', 'info-dim', 'info-border', 'orange', 'orange-dim',
  ],
  shadows: ['sm', 'card', 'header'],
  fontSize: ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl'],
  radius: ['xs', 'sm', 'base', 'lg', 'xl', 'pill'],
  layout: ['sidebar-w', 'topbar-h', 'scrollbar-w'],
};

function cssName(group, key) {
  const kebabKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  if (group === 'colors') return `--color-${kebabKey}`;
  if (group === 'fontSize') return `--font-size-${kebabKey}`;
  if (group === 'fonts') return `--font-${kebabKey}`;
  if (group === 'radius') return key === 'base' ? '--radius' : `--radius-${kebabKey}`;
  return `--${group}-${kebabKey}`;
}

const themeColorKeys = [
  'bg', 'bg-surface', 'bg-surface2', 'bg-surface3', 'bg-elevated',
  'border', 'border-muted', 'border-bright', 'text', 'text-soft',
  'text-secondary', 'text-muted', 'text-dim', 'accent', 'accent-dim',
  'accent-surface', 'accent-border', 'blue', 'blue-dim', 'purple',
  'purple-dim', 'orange', 'orange-dim', 'on-accent', 'danger', 'danger-dim',
  'danger-border', 'warning', 'warning-dim', 'warning-border', 'success',
  'success-dim', 'success-border', 'info', 'info-dim', 'info-border',
].map((key) => `--color-${key}`);

function declarationsIn(block) {
  return new Map([...block.matchAll(/(--[a-z][a-z0-9-]*)\s*:\s*([^;{}]+);/g)]
    .map((match) => [match[1], match[2].trim()]));
}

const themeBlocks = Object.fromEntries([...css.matchAll(/\[data-theme="(light|dark)"\]\s*\{([^}]*)\}/g)]
  .map((match) => [match[1], declarationsIn(match[2])]));

function luminance(hex) {
  const digits = hex.slice(1);
  const rgb = digits.length === 3
    ? [...digits].map((digit) => parseInt(digit + digit, 16))
    : [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16));
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('the public JavaScript export has the documented groups and string values', () => {
  assert.deepEqual(Object.keys(tokens).sort(), ['colors', 'fontSize', 'fonts', 'radius']);
  for (const [groupName, group] of Object.entries(tokens)) {
    assert.ok(group && typeof group === 'object', `${groupName} should be an object`);
    assert.ok(Object.keys(group).length > 0, `${groupName} should not be empty`);
    for (const [key, value] of Object.entries(group)) {
      assert.match(key, /^[a-z][A-Za-z0-9]*$/, `${groupName}.${key} is not a valid identifier`);
      assert.equal(typeof value, 'string', `${groupName}.${key} should be a string`);
      assert.notEqual(value.trim(), '', `${groupName}.${key} should not be empty`);
    }
  }
});

test('canonical JavaScript values remain stable', () => {
  assert.equal(tokens.colors.bg, '#0f1117');
  assert.equal(tokens.colors.accent, '#00e5a0');
  assert.equal(tokens.colors.danger, '#ff6b72');
  assert.equal(tokens.colors.success, '#5ce0a0');
  assert.equal(tokens.radius.pill, '9999px');
  assert.equal(tokens.fontSize.base, '13px');
  assert.match(tokens.fonts.sans, /Inter/);
  assert.match(tokens.fonts.mono, /JetBrains Mono/);
});

test('CSS contains every required token category and identifier', () => {
  for (const [group, keys] of Object.entries(expectedCssGroups)) {
    for (const key of keys) {
      const name = group === 'shadows' ? `--shadow-${key}` : group === 'layout' ? `--${key}` : cssName(group, key);
      assert.ok(cssTokens.has(name), `missing CSS token ${name}`);
    }
  }
});

test('CSS custom properties have valid names and non-empty values', () => {
  assert.ok(declarations.length >= 47, 'the published stylesheet should contain the documented token set');
  for (const { name, value } of declarations) {
    assert.match(name, /^--[a-z][a-z0-9-]*$/, `${name} is not a valid CSS custom-property name`);
    assert.notEqual(value, '', `${name} has an empty value`);
  }
  assert.match(css, /:root\s*\{/);
  assert.match(css, /::-webkit-scrollbar/);
});

test('every semantic colour token exists in both canonical themes', () => {
  for (const theme of ['light', 'dark']) {
    const palette = themeBlocks[theme];
    assert.ok(palette, `missing data-theme="${theme}" selector`);
    for (const token of themeColorKeys) {
      assert.ok(palette.has(token), `${theme} theme is missing ${token}`);
    }
  }
});

test('text and accent foregrounds meet WCAG AA contrast in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const palette = themeBlocks[theme];
    for (const background of ['--color-bg', '--color-bg-surface', '--color-bg-surface2', '--color-bg-elevated']) {
      assert.ok(
        contrastRatio(palette.get('--color-text'), palette.get(background)) >= 4.5,
        `${theme} text on ${background} must meet 4.5:1`,
      );
    }
    assert.ok(
      contrastRatio(palette.get('--color-on-accent'), palette.get('--color-accent')) >= 4.5,
      `${theme} default accent foreground must meet 4.5:1`,
    );
    for (const status of ['danger', 'warning', 'success', 'info']) {
      assert.ok(
        contrastRatio(palette.get(`--color-${status}`), palette.get('--color-bg')) >= 4.5,
        `${theme} ${status} colour on the page background must meet 4.5:1`,
      );
    }
  }
  for (const match of css.matchAll(/\[data-accent="(teal|blue|purple|orange)"\]\s*\{([^}]*)\}/g)) {
    const palette = declarationsIn(match[2]);
    assert.ok(palette.has('--color-accent'), `${match[1]} accent is missing its colour`);
    assert.ok(palette.has('--color-on-accent'), `${match[1]} accent is missing its foreground`);
    assert.ok(
      contrastRatio(palette.get('--color-on-accent'), palette.get('--color-accent')) >= 4.5,
      `${match[1]} accent foreground must meet 4.5:1`,
    );
  }
});

test('canonical accent, density and motion selectors have complete supported values', () => {
  for (const value of ['teal', 'blue', 'purple', 'orange']) {
    assert.match(css, new RegExp(`\\[data-accent="${value}"\\]`));
  }
  for (const value of ['comfortable', 'compact']) {
    assert.match(css, new RegExp(`\\[data-density="${value}"\\]`));
  }
  for (const value of ['system', 'reduce']) {
    assert.match(css, new RegExp(`\\[data-motion="${value}"\\]`));
  }
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('legacy short-name aliases resolve to canonical colour tokens', () => {
  for (const [alias, canonical] of Object.entries({
    '--bg': '--color-bg',
    '--bg-surface': '--color-bg-surface',
    '--text': '--color-text',
    '--accent': '--color-accent',
    '--on-accent': '--color-on-accent',
    '--danger': '--color-danger',
    '--warning': '--color-warning',
    '--success': '--color-success',
    '--info': '--color-info',
  })) {
    assert.equal(cssTokens.get(alias), `var(${canonical})`, `${alias} must remain a canonical alias`);
  }
});

test('CSS values use valid token syntax and aliases resolve to declared properties', () => {
  for (const [name, value] of cssTokens) {
    assert.match(value, /^(#[0-9a-fA-F]{3,8}|rgba?\([^;]+\)|var\(--[a-z][a-z0-9-]*\)|[0-9.]+(?:px|rem|em|%)|[^;]+)$/);
    for (const referenced of value.matchAll(/var\((--[a-z][a-z0-9-]*)\)/g)) {
      assert.ok(cssTokens.has(referenced[1]), `${name} references undefined ${referenced[1]}`);
    }
  }
  assert.equal(cssTokens.get('--color-background-primary'), 'var(--color-bg-elevated)');
  assert.equal(cssTokens.get('--color-text-danger'), 'var(--color-danger)');
  assert.equal(cssTokens.get('--border-radius-md'), '8px');
});

test('JavaScript tokens have corresponding CSS declarations', () => {
  for (const [group, values] of Object.entries(tokens)) {
    for (const [key, value] of Object.entries(values)) {
      const name = cssName(group, key);
      const matches = declarations.filter((declaration) => declaration.name === name);
      assert.ok(matches.length > 0, `missing CSS counterpart ${name}`);
      assert.ok(matches.some((declaration) => declaration.value === value), `${name} does not contain the JS value`);
    }
  }
});

test('the published CSS font aliases retain their current compatibility override', () => {
  const sansDeclarations = declarations.filter(({ name }) => name === '--font-sans');
  const monoDeclarations = declarations.filter(({ name }) => name === '--font-mono');
  assert.equal(sansDeclarations.length, 2);
  assert.equal(monoDeclarations.length, 2);
  assert.notEqual(cssTokens.get('--font-sans'), tokens.fonts.sans);
  assert.notEqual(cssTokens.get('--font-mono'), tokens.fonts.mono);
});

test('TypeScript declarations describe the runtime export', () => {
  assert.match(typescript, /export interface OmniBioAITokens\s*\{/);
  for (const group of ['colors', 'radius', 'fontSize', 'fonts']) {
    assert.match(typescript, new RegExp(`\\b${group}: Record<string, string>;`));
  }
  assert.match(typescript, /export declare const tokens: OmniBioAITokens;/);
});

test('package files and export targets are present and package-safe', () => {
  for (const file of packageJson.files) assert.ok(existsSync(path.join(root, file)), `${file} is missing`);
  assert.equal(packageJson.main, 'tokens.js');
  assert.equal(packageJson.types, 'tokens.ts');
  assert.equal(packageJson.exports['.'], './tokens.js');
  assert.equal(packageJson.exports['./tokens.css'], './tokens.css');
  assert.equal(packageJson.exports['./tokens.js'], './tokens.js');
});
