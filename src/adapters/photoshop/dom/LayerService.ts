import type { LayerService } from '../../types';
import { readActiveDocument, readMemberLength } from './hostAccess';

export function createLayerService(moduleValue: unknown): LayerService {
  return {
    countLayers(): number | null {
      const doc = readActiveDocument(moduleValue);
      if (!doc) return null;
      return readMemberLength(doc, 'layers');
    },
  };
}
