import type { ModuleContract } from '../types';

/**
 * Screen printing (serigrafía) separation and ink workflow.
 * Boundary: may orchestrate engines, must not touch Photoshop APIs directly.
 */
export const screenPrintingModule: ModuleContract = {
  id: 'screen-printing',
  status: 'pending',
  labelKey: 'nav.screenPrinting',
};
