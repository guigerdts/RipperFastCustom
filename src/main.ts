import { createAppContext, mountApp } from './app/bootstrap';
import { es } from './i18n/es';

function start(): void {
  const root = document.getElementById('app-root');
  if (!root) throw new Error('app_root_missing');
  mountApp(root, createAppContext());
}

try {
  start();
} catch (error) {
  console.error('[RipperFastCustom] boot failed', error);
  const root = document.getElementById('app-root');
  if (root) root.textContent = es['error.boot'];
}
