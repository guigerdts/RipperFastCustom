/**
 * Fake host modules used by host-independent tests. They mirror only the
 * members the adapters read, so a contract change breaks these fixtures.
 *
 * The fake models the *staged* host surface: `core` and `imaging` are optional
 * because a Photoshop 22.0 host has neither, and every capability the halftone
 * flow needs can be omitted independently so the gating is testable without a
 * real application.
 */

export interface FakeDocumentSpec {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resolution?: number;
  readonly layerCount?: number;
  readonly id?: number;
  readonly mode?: string;
  readonly bitsPerChannel?: number;
  readonly createLayer?: boolean;
  readonly omit?: readonly (
    | 'name'
    | 'width'
    | 'height'
    | 'resolution'
    | 'layers'
    | 'id'
    | 'mode'
    | 'bitsPerChannel'
    | 'createLayer'
  )[];
}

export interface FakeImagingSpec {
  /** Omit the whole `imaging` module when false. */
  readonly withImaging?: boolean;
  readonly withGetPixels?: boolean;
  readonly withPutPixels?: boolean;
}

export interface FakeHostSpec {
  readonly withApp?: boolean;
  readonly withDocuments?: boolean;
  readonly withCreateDocument?: boolean;
  /** Omit the whole `core` module when false, as a pre-22.5 host does. */
  readonly withCore?: boolean;
  readonly withExecuteAsModal?: boolean;
  /** Value `core.apiVersion` reports; `null` omits the member. */
  readonly apiVersion?: number | null;
  readonly imaging?: FakeImagingSpec;
  readonly document?: FakeDocumentSpec | null;
  readonly throwOnActiveDocument?: boolean;
}

export function createFakePhotoshopModule(spec: FakeHostSpec = {}): Record<string, unknown> {
  const omit = new Set(spec.document?.omit ?? []);
  const moduleValue: Record<string, unknown> = {};

  if (spec.withApp !== false) {
    const app: Record<string, unknown> = {};

    if (spec.withDocuments !== false) app['documents'] = { length: 3 };
    if (spec.withCreateDocument !== false) {
      app['createDocument'] = async () => createFakePhotoshopModule({ document: {} });
    }

    if (spec.throwOnActiveDocument) {
      Object.defineProperty(app, 'activeDocument', {
        get() {
          throw new Error('no document open');
        },
      });
    } else if (spec.document) {
      const doc: Record<string, unknown> = {};
      if (!omit.has('id')) doc['id'] = spec.document.id ?? 101;
      if (!omit.has('name')) doc['name'] = spec.document.name ?? 'Sample.psd';
      if (!omit.has('width')) doc['width'] = spec.document.width ?? 1920;
      if (!omit.has('height')) doc['height'] = spec.document.height ?? 1080;
      if (!omit.has('resolution')) doc['resolution'] = spec.document.resolution ?? 300;
      if (!omit.has('mode')) doc['mode'] = spec.document.mode ?? 'RGB';
      if (!omit.has('bitsPerChannel')) doc['bitsPerChannel'] = spec.document.bitsPerChannel ?? 8;
      if (!omit.has('layers')) doc['layers'] = { length: spec.document.layerCount ?? 4 };
      if (!omit.has('createLayer') && spec.document.createLayer !== false) {
        doc['createLayer'] = async () => ({ id: 202 });
      }
      app['activeDocument'] = doc;
    } else {
      app['activeDocument'] = undefined;
    }

    moduleValue['app'] = app;
  }

  if (spec.withCore !== false) {
    const core: Record<string, unknown> = {};
    if (spec.apiVersion !== null && spec.apiVersion !== undefined) {
      core['apiVersion'] = spec.apiVersion;
    }
    if (spec.withExecuteAsModal !== false) {
      core['executeAsModal'] = async (callback: (ctx: unknown) => unknown) =>
        callback({
          isCancelled: false,
          onCancel: () => undefined,
          reportProgress: () => undefined,
        });
    }
    moduleValue['core'] = core;
  }

  const imagingSpec = spec.imaging ?? {};
  if (imagingSpec.withImaging !== false) {
    const imaging: Record<string, unknown> = {};
    if (imagingSpec.withGetPixels !== false) imaging['getPixels'] = async () => ({});
    if (imagingSpec.withPutPixels !== false) imaging['putPixels'] = async () => undefined;
    moduleValue['imaging'] = imaging;
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
