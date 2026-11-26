/**
 * Build configuration for the RipperFastCustom UXP plugin.
 *
 * Output is a single IIFE bundle: UXP loads plugins through a plain
 * `<script src="index.js"></script>` tag, so no ESM loader is required at
 * runtime. `scripts/build.mjs` assembles the installable `dist/` folder.
 */
export default {
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'RipperFastCustom',
      fileName: () => 'index.js',
    },
    target: 'es2019',
    minify: false,
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
    reportCompressedSize: false,
  },
};
