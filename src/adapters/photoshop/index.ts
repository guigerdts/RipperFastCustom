import type { PhotoshopHostAdapter } from '../types';
import type { ModuleLoader } from '../runtime/moduleLoader';
import { PhotoshopDomAdapter } from './dom/PhotoshopDomAdapter';

/**
 * Creates the host adapter for the current runtime. UI code must obtain its
 * Photoshop access exclusively through this factory (or an injected adapter).
 */
export function createPhotoshopHostAdapter(loader: ModuleLoader): PhotoshopHostAdapter {
  return new PhotoshopDomAdapter(loader);
}

export { PhotoshopDomAdapter };
