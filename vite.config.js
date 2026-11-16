import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，构建产物可直接双击 dist/index.html 打开
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
