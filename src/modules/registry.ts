import { calibrationModule } from './calibration/contract';
import { dtfStudioModule } from './dtf-studio/contract';
import { halftoneStudioModule } from './halftone-studio/contract';
import { preflightModule } from './preflight/contract';
import { productionModule } from './production/contract';
import { screenPrintingModule } from './screen-printing/contract';
import type { ModuleContract, ModuleId } from './types';

/** Single source of truth for feature-module state. */
export const MODULES: readonly ModuleContract[] = [
  screenPrintingModule,
  dtfStudioModule,
  halftoneStudioModule,
  calibrationModule,
  preflightModule,
  productionModule,
];

export function getModule(id: ModuleId): ModuleContract | undefined {
  return MODULES.find((module) => module.id === id);
}

export function isModuleImplemented(id: ModuleId): boolean {
  return getModule(id)?.status === 'available';
}
