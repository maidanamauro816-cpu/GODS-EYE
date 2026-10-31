/// <reference types="@capacitor/background-runner" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.godseye.world',
  appName: "GOD'S EYE",
  webDir: 'dist',
  bundledWebRuntime: false,
  android: { allowMixedContent: false },
  plugins: {
    BackgroundRunner: {
      label: 'com.godseye.world.disaster-alerts',
      src: 'runners/disaster-runner.js',
      event: 'checkDisasters',
      repeat: true,
      interval: 15,
      autoStart: true
    }
  }
};

export default config;
