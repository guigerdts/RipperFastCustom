import type { PhotoshopHostAdapter } from '../types';
import type { ModuleLoader } from '../runtime/moduleLoader';
import { PhotoshopApiV1Adapter } from './api-v1/PhotoshopApiV1Adapter';

/**
 * Creates the host adapter for the current runtime. UI code must obtain its
 * Photoshop access exclusively through this factory (or an injected adapter).
 */
export function createPhotoshopHostAdapter(loader: ModuleLoader): PhotoshopHostAdapter {
  return new PhotoshopApiV1Adapter(loader);
}

export { PhotoshopApiV1Adapter };
