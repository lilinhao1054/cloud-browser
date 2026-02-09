import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // lib 模式：打包 SDK 库
  if (mode === 'lib') {
    return {
      plugins: [
        dts({
          include: ['src/lib/**/*', 'src/index.ts'],
          outDir: 'dist',
          rollupTypes: true,
        }),
      ],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'CloudBrowserSDK',
          fileName: 'cloud-browser-sdk',
          formats: ['es'],
        },
        rollupOptions: {
          external: ['socket.io-client', 'eventemitter3'],
          output: {
            globals: {
              'socket.io-client': 'io',
              'eventemitter3': 'EventEmitter',
            },
          },
        },
        sourcemap: true,
        minify: 'esbuild',
      },
    };
  }

  // 默认模式：demo 开发和构建
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist-demo',
    },
    root: '.',
  };
});
