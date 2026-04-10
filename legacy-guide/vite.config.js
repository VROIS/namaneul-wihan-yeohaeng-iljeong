import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'public',
  publicDir: false,
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'public/index.html'),
      },
    },
    copyPublicDir: false,
  },
  server: {
    port: 5173,
  },
  plugins: [
    {
      name: 'copy-static-files',
      writeBundle() {
        const filesToCopy = [
          'service-worker.js',
          'manifest.json',
          'share.html',
          'index.js',
          'share-page.js',
          'geminiService.js',
          'imageOptimizer.js',
          'performanceMonitor.js',
          'generate-standalone.js',
          'tailwind.css',
          'admin-dashboard.html',
          'user-guide.html',
          'profile.html',
          'language-helper.js',
          'sw-share.js',
          'admin-settings.html',
          'download.html',
          'privacy.html'
        ];
        
        filesToCopy.forEach(file => {
          const src = path.resolve(__dirname, 'public', file);
          const dest = path.resolve(__dirname, 'dist/public', file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        });
        
        // ⚠️ 수정금지(승인필요): 2026-03-19 모든 디렉토리 재귀 복사 — 서브디렉토리 대응 (fs.cpSync, Node 16.7+)
        const dirsToCopy = ['assets', 'shared-template', 'images', 'components'];
        dirsToCopy.forEach(dir => {
          const src = path.resolve(__dirname, 'public', dir);
          const dest = path.resolve(__dirname, 'dist/public', dir);
          if (fs.existsSync(src)) {
            fs.cpSync(src, dest, { recursive: true });
          }
        });
      }
    }
  ],
});
