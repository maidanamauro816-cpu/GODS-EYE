import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.godseye.world',
  appName: "GOD'S EYE",
  webDir: 'dist',
  bundledWebRuntime: false,
  android: { allowMixedContent: false }
};

export default config;
