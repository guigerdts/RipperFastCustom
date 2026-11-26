import type { ModuleContract } from '../types';

/**
 * Production manager: job queue, imposition and output tracking.
 * Boundary: must never invent production data — only user-provided or
 * document-derived values may be displayed.
 */
export const productionModule: ModuleContract = {
  id: 'production',
  status: 'pending',
  labelKey: 'nav.production',
};
