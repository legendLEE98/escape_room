import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': 'http://127.0.0.1:3100',
  '/socket.io': { target: 'http://127.0.0.1:3100', ws: true },
};

export default defineConfig({
  plugins: [react()],
  // Lets `vite` / `vite preview` talk to the dockerised backend on :3100 the
  // same way nginx does in production.
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
