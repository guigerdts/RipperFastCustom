import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { MODULES, getModule, isModuleImplemented } from '../../src/modules/registry';
import type { ModuleId } from '../../src/modules/types';
import { NAV_ITEMS } from '../../src/ui/shell/navigation';

const EXPECTED_ORDER = [
  'dashboard',
  'screen-printing',
  'dtf-studio',
  'halftone-studio',
  'calibration',
  'preflight',
  'production',
  'settings',
] as const;

describe('navigation', () => {
  it('declares the eight required sections in order', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([...EXPECTED_ORDER]);
    expect(NAV_ITEMS).toHaveLength(8);
  });

  it('labels every section in both dictionaries', () => {
    for (const item of NAV_ITEMS) {
      expect(es[item.labelKey], item.id).toBeTruthy();
      expect(en[item.labelKey], item.id).toBeTruthy();
    }
  });

  it('marks the six feature modules as modules and the rest as builtin', () => {
    const modules = NAV_ITEMS.filter((item) => item.kind === 'module').map((item) => item.id);
    const builtin = NAV_ITEMS.filter((item) => item.kind === 'builtin').map((item) => item.id);
    expect(builtin).toEqual(['dashboard', 'settings']);
    expect(modules).toHaveLength(6);
  });
});

describe('module registry', () => {
  it('registers every module section of the navigation exactly once', () => {
    const registered = MODULES.map((module) => module.id).sort();
    const navModules = NAV_ITEMS.filter((item) => item.kind === 'module')
      .map((item) => item.id)
      .sort();
    expect(registered).toEqual([...navModules]);
    expect(new Set(registered).size).toBe(registered.length);
  });

  it('keeps every module explicitly pending in v0.1.0', () => {
    for (const module of MODULES) {
      expect(module.status, module.id).toBe('pending');
      expect(isModuleImplemented(module.id)).toBe(false);
    }
  });

  it('resolves known ids and returns undefined for unknown ones', () => {
    const id: ModuleId = 'preflight';
    expect(getModule(id)?.labelKey).toBe('nav.preflight');
    expect(getModule('does-not-exist' as ModuleId)).toBeUndefined();
  });
});
