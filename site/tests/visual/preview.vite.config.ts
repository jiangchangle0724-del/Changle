import { defineConfig, mergeConfig } from 'vite';
import siteConfig from '../../vite.config';

// Keep the normal production build; add only the gallery used by this suite.
export default mergeConfig(siteConfig, defineConfig({
  build: { emptyOutDir: false, rollupOptions: { input: 'ui-preview.html' } },
}));
