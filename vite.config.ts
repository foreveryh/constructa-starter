import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig, loadEnv, type ConfigEnv, type ViteDevServer } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import browserEcho from '@browser-echo/vite';
import Icons from 'unplugin-icons/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';

// WebSocket plugin for Agent Chat - uses standalone bootstrap to avoid path alias issues
function agentWebSocketPlugin() {
  return {
    name: 'agent-websocket',
    configureServer(server: ViteDevServer) {
      // Return a post hook that runs after Vite server is fully ready
      return () => {
        // Lazy import the standalone bootstrap file
        import('./src/server/ws-bootstrap.js').then(({ createAgentWebSocketServer }) => {
          createAgentWebSocketServer(server.httpServer);
        }).catch(err => {
          console.error('[WS Plugin] Failed to load WebSocket server:', err);
        });
      };
    },
  };
}

export default ({ mode }: ConfigEnv) => {
  // Regression in TanStack Start RC1: loadEnv now keeps the VITE_ prefix, so we
  // manually clear the prefix until upstream restores the previous behaviour.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return defineConfig({
    server: {
      port: 3000,
      allowedHosts: ['db15f87f452b.ngrok-free.app'],
    },
    ssr: {
      // Ensure Node-y Mastra stays external to avoid bundling issues
      noExternal: ['@mastra/*'],
    },
    plugins: [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      agentWebSocketPlugin(), // Agent WebSocket server
      tanstackStart(),
      nitro(),
      viteReact(),
      Icons({
        compiler: 'jsx',
        jsx: 'react',
        autoInstall: true,
      }),
      tailwindcss(),
      browserEcho({
        // TanStack Start specific configuration
        injectHtml: false, // TanStack Start doesn't use index.html
        stackMode: 'condensed', // Better stack traces
        colors: true,
        fileLog: {
          enabled: false, // Enable file logging to logs/frontend
        },
        networkLogs: {
          enabled: true,
          bodies: {
            request: true,
            response: true,
          },
        },
      }),
    ],
  });
};
