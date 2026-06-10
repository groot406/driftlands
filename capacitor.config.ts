import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.looperlands.driftlands',
  appName: 'Driftlands',
  webDir: 'dist',
  server: {
    iosScheme: 'https',
  },
};

export default config;
