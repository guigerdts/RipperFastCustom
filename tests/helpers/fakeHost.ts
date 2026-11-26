/**
 * Fake host modules used by host-independent tests. They mirror only the
 * members the adapters read, so a contract change breaks these fixtures.
 */

export interface FakeDocumentSpec {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resolution?: number;
  readonly layerCount?: number;
  readonly omit?: readonly ('name' | 'width' | 'height' | 'resolution' | 'layers')[];
}

export interface FakeHostSpec {
  readonly withApp?: boolean;
  readonly withDocuments?: boolean;
  readonly withExecuteAsModal?: boolean;
  readonly document?: FakeDocumentSpec | null;
  readonly throwOnActiveDocument?: boolean;
}

export function createFakePhotoshopModule(spec: FakeHostSpec = {}): Record<string, unknown> {
  const omit = new Set(spec.document?.omit ?? []);
  const moduleValue: Record<string, unknown> = {};

  if (spec.withApp !== false) {
    const app: Record<string, unknown> = {};

    if (spec.withDocuments !== false) app['documents'] = { length: 3 };

    if (spec.throwOnActiveDocument) {
      Object.defineProperty(app, 'activeDocument', {
        get() {
          throw new Error('no document open');
        },
      });
    } else if (spec.document) {
      const doc: Record<string, unknown> = {};
      if (!omit.has('name')) doc['name'] = spec.document.name ?? 'Sample.psd';
      if (!omit.has('width')) doc['width'] = spec.document.width ?? 1920;
      if (!omit.has('height')) doc['height'] = spec.document.height ?? 1080;
      if (!omit.has('resolution')) doc['resolution'] = spec.document.resolution ?? 300;
      if (!omit.has('layers')) doc['layers'] = { length: spec.document.layerCount ?? 4 };
      app['activeDocument'] = doc;
    } else {
      app['activeDocument'] = undefined;
    }

    moduleValue['app'] = app;
  }

  if (spec.withExecuteAsModal !== false) {
    moduleValue['core'] = {
      executeAsModal: async (callback: (ctx: unknown) => unknown) => callback({}),
    };
  }

  return moduleValue;
}

export function createFakeUxpModule(
  options: { hostVersion?: string; uxpVersion?: string } = {},
): Record<string, unknown> {
  return {
    host: { name: 'photoshop', version: options.hostVersion ?? '22.0.0' },
    versions: { uxp: options.uxpVersion ?? 'uxp-5.0.0' },
  };
}

export type FakeModuleMap = Readonly<Record<string, unknown>>;

/** Module loader backed by an in-memory map; unknown ids throw. */
export function createFakeLoader(modules: FakeModuleMap): (id: string) => unknown {
  return (id: string): unknown => {
    const value = modules[id];
    if (value === undefined) throw new Error(`module_not_found:${id}`);
    return value;
  };
}
