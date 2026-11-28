import type { ModuleLoader } from '../../runtime/moduleLoader';
import { loadModuleOrNull } from '../../runtime/moduleLoader';
import type { PhotoshopCapabilities } from '../../capability';
import type { DocumentService, LayerService, PhotoshopHostAdapter } from '../../types';
import { detectCapabilities } from '../capabilities';
import { createDocumentService } from './DocumentService';
import { createLayerService } from './LayerService';
import { readActiveDocument } from './hostAccess';

const PHOTOSHOP_MODULE_ID = 'photoshop';

/**
 * Host adapter over the Photoshop DOM, shared by both staged manifests.
 *
 * It declares no API version of its own: the staged manifest decides what the
 * host exposes, and every member is feature-detected before use. That is why
 * the same instance serves a 22.0 host (no `core`, no `imaging`) and a 24.4
 * host (modal scope plus pixel access) without variant-specific code.
 *
 * The module is loaded once; capability detection and document reads are
 * re-evaluated on every access so a document opened after boot is picked up
 * without re-creating the adapter.
 */
export class PhotoshopDomAdapter implements PhotoshopHostAdapter {
  readonly documents: DocumentService;
  readonly layers: LayerService;

  private readonly moduleValue: unknown;

  constructor(loader: ModuleLoader) {
    this.moduleValue = loadModuleOrNull(loader, PHOTOSHOP_MODULE_ID);
    this.documents = createDocumentService(this.moduleValue);
    this.layers = createLayerService(this.moduleValue);
  }

  get available(): boolean {
    return this.capabilities.isAvailable('photoshop.module');
  }

  get capabilities(): PhotoshopCapabilities {
    return detectCapabilities(this.moduleValue, readActiveDocument(this.moduleValue));
  }
}
