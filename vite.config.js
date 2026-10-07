import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds:
//   npm run build            → dist/ for GitHub Pages (strict CSP, hashed assets)
//   npm run build:preview    → dist-preview/index.html, one self-contained file
//                              for hosts that can only serve a single page.
export default defineConfig(({ mode }) => {
  const single = mode === 'preview';
  return {
    base: './',
    build: {
      outDir: single ? 'dist-preview' : 'dist',
      target: 'es2022',
      sourcemap: false,
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 2000, // one bundle on purpose: the app works offline and in the desktop shell
    },
    plugins: single
      ? [
          viteSingleFile(),
          {
            // The single-file preview is served by hosts that set their own
            // Content Security Policy, so the page's meta CSP is removed there.
            // The GitHub Pages build keeps the strict one.
            name: 'drop-meta-csp',
            transformIndexHtml: (html) =>
              html.replace(/\s*<!-- Strict Content Security Policy[^>]*-->\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*\/>/, ''),
          },
        ]
      : [],
    test: {
      include: ['tests/**/*.test.js'],
      environment: 'node',
    },
  };
});
