/**
 * Spanish dictionary — the canonical key set for the plugin.
 * Every other locale must provide exactly these keys (enforced by types).
 */
export const es = {
  'app.name': 'RipperFastCustom',
  'app.tagline': 'Serigrafía · DTF · Semitonos',

  'nav.dashboard': 'Panel general',
  'nav.screenPrinting': 'Serigrafía',
  'nav.dtfStudio': 'DTF Studio',
  'nav.halftoneStudio': 'Halftone Studio',
  'nav.calibration': 'Calibration Lab',
  'nav.preflight': 'Preflight',
  'nav.production': 'Production Manager',
  'nav.settings': 'Ajustes',
  'nav.sections': 'Secciones',

  'common.notAvailable': 'No disponible',
  'common.language': 'Idioma',
  'common.pending': 'Pendiente',
  'common.available': 'Disponible',
  'common.unavailable': 'No disponible',
  'common.unknown': 'Sin determinar',
  'common.noDocument': 'Sin documento activo',
  'common.error': 'Error',

  'dashboard.title': 'Panel general',
  'dashboard.connection': 'Conexión con Photoshop',
  'dashboard.connection.online': 'Conectado',
  'dashboard.connection.offline': 'Sin conexión',
  'dashboard.activeDocument': 'Documento activo',
  'dashboard.dimensions': 'Dimensiones',
  'dashboard.resolution': 'Resolución',
  'dashboard.photoshopVersion': 'Versión de Photoshop',
  'dashboard.uxpVersion': 'Versión de UXP',
  'dashboard.apiVersion': 'API de Photoshop',
  'dashboard.manifestVersion': 'Versión de manifiesto',
  'dashboard.capabilities': 'Capacidades',
  'dashboard.capabilitiesSummary':
    '{available} disponibles · {unavailable} no disponibles · {unknown} sin determinar',
  'dashboard.halftoneFlow': 'Flujo de semitono',
  'dashboard.halftoneFlow.ready': 'Disponible',
  'dashboard.halftoneFlow.blocked': 'No disponible en esta versión',
  'dashboard.halftoneFlow.missing': 'Falta: {list}',
  'dashboard.noDocumentHint': 'Abre un documento en Photoshop para ver sus dimensiones.',

  'pending.title': 'Módulo pendiente',
  'pending.description': 'El módulo {module} aún no está implementado en esta versión.',
  'pending.notice':
    'Esta versión solo incluye la base: detección de entorno, idiomas y navegación.',

  'settings.title': 'Ajustes',
  'settings.language': 'Idioma de la interfaz',
  'settings.languageHint': 'El cambio se aplica al instante, sin reiniciar el plugin.',
  'settings.runtime': 'Entorno detectado',
  'settings.storage': 'Almacenamiento de sesión',
  'settings.storageValue': 'En memoria (sin permisos de archivo)',
  'settings.pluginId': 'ID del plugin',
  'settings.version': 'Versión',

  'error.boot': 'No se pudo iniciar RipperFastCustom.',
} as const;

/** Canonical translation key set, derived from the Spanish dictionary. */
export type TranslationKey = keyof typeof es;
