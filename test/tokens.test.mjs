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
    'success-border', 'info', 'info-dim', 'info-border',
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
  assert.equal(tokens.colors.danger, '#ef4444');
  assert.equal(tokens.colors.success, '#22c55e');
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
