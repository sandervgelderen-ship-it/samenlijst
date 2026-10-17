import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samenlijst.app',
  appName: 'Samenlijst',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;
