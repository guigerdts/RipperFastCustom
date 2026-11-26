import type { ModuleContract } from '../types';

/**
 * Calibration lab: ink, press and screen calibration routines.
 * Boundary: must not write calibration data without explicit user action.
 */
export const calibrationModule: ModuleContract = {
  id: 'calibration',
  status: 'pending',
  labelKey: 'nav.calibration',
};
