import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'postbuild-extension-cleanup',
      closeBundle() {
        // Ensure dist/sidepanel/index.html, dist/popup/index.html, dist/options/index.html exist
        const pages = ['sidepanel', 'popup', 'options'];
        for (const page of pages) {
          const srcPath = path.resolve(__dirname, `dist/src/${page}/index.html`);
          const targetDir = path.resolve(__dirname, `dist/${page}`);
          const targetPath = path.resolve(targetDir, 'index.html');

          if (fs.existsSync(srcPath)) {
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.copyFileSync(srcPath, targetPath);
          }
        }

        // Clean up dist/src directory if empty or redundant
        const distSrc = path.resolve(__dirname, 'dist/src');
        if (fs.existsSync(distSrc)) {
          fs.rmSync(distSrc, { recursive: true, force: true });
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, 'src/sidepanel/index.html'),
        popup: path.resolve(__dirname, 'src/popup/index.html'),
        options: path.resolve(__dirname, 'src/options/index.html'),
        background: path.resolve(__dirname, 'src/background/service-worker.ts'),
        content: path.resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return '[name]/[name].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
