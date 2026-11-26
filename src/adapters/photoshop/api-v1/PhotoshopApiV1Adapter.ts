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
 * Photoshop host adapter bound to DOM API v1 (the MAX 2020 / Photoshop 22.0
 * surface declared in the manifest).
 *
 * The module is loaded once; capability detection and document reads are
 * re-evaluated on every access so a document opened after boot is picked up
 * without re-creating the adapter.
 */
export class PhotoshopApiV1Adapter implements PhotoshopHostAdapter {
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
