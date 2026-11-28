import type { TranslationKey } from './es';

/** English dictionary. Typed against the Spanish key set so a missing key fails the build. */
export const en: Record<TranslationKey, string> = {
  'app.name': 'RipperFastCustom',
  'app.tagline': 'Screen printing · DTF · Halftones',

  'nav.dashboard': 'Dashboard',
  'nav.screenPrinting': 'Screen Printing',
  'nav.dtfStudio': 'DTF Studio',
  'nav.halftoneStudio': 'Halftone Studio',
  'nav.calibration': 'Calibration Lab',
  'nav.preflight': 'Preflight',
  'nav.production': 'Production Manager',
  'nav.settings': 'Settings',
  'nav.sections': 'Sections',

  'common.notAvailable': 'Not available',
  'common.language': 'Language',
  'common.pending': 'Pending',
  'common.available': 'Available',
  'common.unavailable': 'Not available',
  'common.unknown': 'Undetermined',
  'common.noDocument': 'No active document',
  'common.error': 'Error',

  'dashboard.title': 'Dashboard',
  'dashboard.connection': 'Photoshop connection',
  'dashboard.connection.online': 'Connected',
  'dashboard.connection.offline': 'Disconnected',
  'dashboard.activeDocument': 'Active document',
  'dashboard.dimensions': 'Dimensions',
  'dashboard.resolution': 'Resolution',
  'dashboard.photoshopVersion': 'Photoshop version',
  'dashboard.uxpVersion': 'UXP version',
  'dashboard.apiVersion': 'Photoshop API',
  'dashboard.manifestVersion': 'Manifest version',
  'dashboard.capabilities': 'Capabilities',
  'dashboard.capabilitiesSummary':
    '{available} available · {unavailable} not available · {unknown} undetermined',
  'dashboard.halftoneFlow': 'Halftone flow',
  'dashboard.halftoneFlow.ready': 'Available',
  'dashboard.halftoneFlow.blocked': 'Not available on this version',
  'dashboard.halftoneFlow.missing': 'Missing: {list}',
  'dashboard.noDocumentHint': 'Open a document in Photoshop to see its dimensions.',

  'pending.title': 'Module pending',
  'pending.description': 'The {module} module is not implemented in this version yet.',
  'pending.notice':
    'This release only ships the foundation: environment detection, languages and navigation.',

  'settings.title': 'Settings',
  'settings.language': 'Interface language',
  'settings.languageHint': 'Changes apply immediately, without restarting the plugin.',
  'settings.runtime': 'Detected environment',
  'settings.storage': 'Session storage',
  'settings.storageValue': 'In memory (no file permissions)',
  'settings.pluginId': 'Plugin ID',
  'settings.version': 'Version',

  'error.boot': 'RipperFastCustom could not start.',
};
