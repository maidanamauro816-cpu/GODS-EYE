import { Capacitor } from '@capacitor/core';
import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { t } from './i18n/index.js';

// The browser uses same-origin Vercel routes. The Android build sends only
// same-origin /api requests to the public production API host.
const GODS_EYE_API_ORIGIN =
  import.meta.env.VITE_GEV_API_ORIGIN ||
  'https://gods-eye-neon.vercel.app';
if (Capacitor.isNativePlatform()) {
  const godsEyeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input?.url;
    if (typeof raw === 'string') {
      try {
        const target = new URL(raw, window.location.origin);
        if (
          target.origin === window.location.origin &&
          target.pathname.startsWith('/api/')
        ) {
          const absolute = GODS_EYE_API_ORIGIN + target.pathname + target.search;
          if (input instanceof Request)
            return godsEyeFetch(new Request(absolute, input), init);
          return godsEyeFetch(absolute, init);
        }
      } catch {
        // Preserve native fetch behavior for non-URL inputs.
      }
    }
    return godsEyeFetch(input, init);
  };
}

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch((error) => {
  console.error("God's Eye View initialization failed:", error);
  const loaderStatus = document.querySelector(
    '#loading-screen .loader-status',
  );
  if (loaderStatus) {
    loaderStatus.textContent = t('Error: {message}', {
      message: describeError(error),
    });
    loaderStatus.style.color = '#ff4444';
  }
});

export { application };
