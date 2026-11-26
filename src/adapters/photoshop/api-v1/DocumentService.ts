import type { ActiveDocumentInfo, DocumentService } from '../../types';
import {
  readActiveDocument,
  readApp,
  readMemberLength,
  readMemberNumber,
  readMemberString,
} from './hostAccess';

export function createDocumentService(moduleValue: unknown): DocumentService {
  return {
    getActiveDocumentInfo(): ActiveDocumentInfo | null {
      const doc = readActiveDocument(moduleValue);
      if (!doc) return null;

      const info: ActiveDocumentInfo = {
        name: readMemberString(doc, 'name'),
        width: readMemberNumber(doc, 'width'),
        height: readMemberNumber(doc, 'height'),
        resolution: readMemberNumber(doc, 'resolution'),
      };
      return info;
    },

    countOpenDocuments(): number | null {
      const app = readApp(moduleValue);
      if (!app) return null;
      return readMemberLength(app, 'documents');
    },
  };
}
