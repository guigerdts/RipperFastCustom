import type { ModuleContract } from '../types';

/**
 * DTF studio: film artwork preparation and print ordering.
 * Boundary: may orchestrate engines, must not touch Photoshop APIs directly.
 */
export const dtfStudioModule: ModuleContract = {
  id: 'dtf-studio',
  status: 'pending',
  labelKey: 'nav.dtfStudio',
};
