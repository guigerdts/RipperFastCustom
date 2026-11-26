import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext, mountApp, STORAGE_KEYS } from '../../src/app/bootstrap';
import { createInMemoryStorage } from '../../src/services/storage/StorageService';
import {
  createFakeLoader,
  createFakePhotoshopModule,
  createFakeUxpModule,
} from '../helpers/fakeHost';

function mount(): {
  root: HTMLElement;
  context: ReturnType<typeof createAppContext>;
  handle: ReturnType<typeof mountApp>;
} {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const context = createAppContext({
    loader: createFakeLoader({
      photoshop: createFakePhotoshopModule({ document: {} }),
      uxp: createFakeUxpModule(),
    }),
  });
  const handle = mountApp(root, context);
  return { root, context, handle };
}

describe('application bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects the host and UXP versions', () => {
    const context = createAppContext({
      loader: createFakeLoader({
        photoshop: createFakePhotoshopModule(),
        uxp: createFakeUxpModule({ hostVersion: '22.0.0', uxpVersion: 'uxp-5.0.0' }),
      }),
    });

    expect(context.environment.hostName).toBe('photoshop');
    expect(context.environment.hostVersion).toBe('22.0.0');
    expect(context.environment.uxpVersion).toBe('uxp-5.0.0');
    expect(context.environment.moduleLoaderAvailable).toBe(true);
    expect(context.host.available).toBe(true);
  });

  it('records startup diagnostics', () => {
    const context = createAppContext({
      loader: createFakeLoader({
        photoshop: createFakePhotoshopModule(),
        uxp: createFakeUxpModule(),
      }),
    });
    const codes = context.diagnostics.entries().map((entry) => entry.code);
    expect(codes).toContain('bootstrap.start');
    expect(codes).toContain('environment.photoshop');
    expect(codes).toContain('bootstrap.ready');
    expect(context.diagnostics.hasErrors()).toBe(false);
  });

  it('degrades to offline instead of throwing when no host is reachable', () => {
    const context = createAppContext({
      loader: createFakeLoader({}),
    });

    expect(context.host.available).toBe(false);
    expect(context.environment.moduleLoaderAvailable).toBe(true);
    expect(context.environment.uxpModuleLoaded).toBe(false);
    expect(context.diagnostics.hasErrors()).toBe(false);

    const handle = mountApp(document.createElement('div'), context);
    expect(handle.getScreen()).toBe('dashboard');
  });

  it('reports an unavailable module loader as an error', () => {
    const context = createAppContext({
      loader: () => {
        throw new Error('module_loader_unavailable');
      },
    });
    expect(context.environment.moduleLoaderAvailable).toBe(false);
    expect(context.diagnostics.hasErrors()).toBe(true);
  });

  it('starts on the default locale when nothing is stored', () => {
    const context = createAppContext({ loader: createFakeLoader({}) });
    expect(context.i18n.locale).toBe('es');
    expect(context.config.locale).toBe('es');
  });
});

describe('panel mounting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the dashboard with product, connection and host facts', () => {
    const { root } = mount();

    expect(root.textContent).toContain('RipperFastCustom');
    expect(root.textContent).toContain('0.1.0');
    expect(root.textContent).toContain('Conectado');
    expect(root.textContent).toContain('22.0.0');
    expect(root.textContent).toContain('uxp-5.0.0');
    expect(root.textContent).toContain('Panel general');
    expect(root.textContent).toContain('1920 × 1080 px');
    expect(root.textContent).toContain('300 ppi');
  });

  it('renders eight navigation entries', () => {
    const { root } = mount();
    expect(root.querySelectorAll('.rfc-nav__item')).toHaveLength(8);
  });

  it('shows an explicit pending screen for unimplemented modules', () => {
    const { root } = mount();
    const button = root.querySelector<HTMLButtonElement>('[data-screen="halftone-studio"]');
    expect(button).not.toBeNull();
    button?.click();

    expect(root.textContent).toContain('Halftone Studio');
    expect(root.textContent).toContain('Módulo pendiente');
    expect(root.textContent).toContain('aún no está implementado');
  });

  it('shows the offline state when the host is missing', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountApp(root, createAppContext({ loader: createFakeLoader({}) }));

    expect(root.textContent).toContain('Sin conexión');
    expect(root.textContent).toContain('No disponible');
  });

  it('switches language in place without remounting the panel', () => {
    const { root, context, handle } = mount();
    expect(root.textContent).toContain('Panel general');

    root.querySelector<HTMLButtonElement>('[data-screen="settings"]')?.click();
    expect(root.textContent).toContain('Ajustes');

    const select = root.querySelector<HTMLSelectElement>('#rfc-locale-select');
    expect(select).not.toBeNull();
    if (select) {
      select.value = 'en';
      select.dispatchEvent(new Event('change'));
    }

    expect(context.i18n.locale).toBe('en');
    expect(handle.getScreen()).toBe('settings');
    expect(root.textContent).toContain('Dashboard');
    expect(root.textContent).toContain('Settings');
    expect(root.textContent).not.toContain('Ajustes');
    expect(root.querySelectorAll('.rfc-nav__item')).toHaveLength(8);
  });

  it('removes listeners when destroyed', () => {
    const { root, handle } = mount();
    handle.destroy();
    expect(root.textContent).toBe('');
  });
});

describe('session storage', () => {
  it('carries the chosen locale into a new context using the same storage', () => {
    const storage = createInMemoryStorage();
    const loader = createFakeLoader({
      photoshop: createFakePhotoshopModule(),
      uxp: createFakeUxpModule(),
    });

    const first = createAppContext({ loader, storage });
    first.i18n.setLocale('en');

    expect(storage.get(STORAGE_KEYS.locale)).toBe('en');

    const second = createAppContext({ loader, storage });
    expect(second.i18n.locale).toBe('en');
  });

  it('ignores an invalid stored locale', () => {
    const storage = createInMemoryStorage();
    storage.set(STORAGE_KEYS.locale, 'xx');

    const context = createAppContext({ loader: createFakeLoader({}), storage });
    expect(context.i18n.locale).toBe('es');
    expect(context.diagnostics.entries().some((entry) => entry.code === 'config.invalid')).toBe(
      true,
    );
  });
});
