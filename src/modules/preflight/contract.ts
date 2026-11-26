import type { ModuleContract } from '../types';

/**
 * Preflight: pre-production validation of documents and separations.
 * Boundary: read-only with respect to the Photoshop document.
 */
export const preflightModule: ModuleContract = {
  id: 'preflight',
  status: 'pending',
  labelKey: 'nav.preflight',
};
