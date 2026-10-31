const GODS_EYE_API_ORIGIN = 'https://gods-eye-neon.vercel.app';
const godsEyeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  if (typeof raw === 'string' && raw.startsWith('/api/')) {
    const absolute = GODS_EYE_API_ORIGIN + raw;
    if (input instanceof Request) return godsEyeFetch(new Request(absolute, input), init);
    return godsEyeFetch(absolute, init);
  }
  return godsEyeFetch(input, init);
};
import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { t } from './i18n/index.js';

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch((error) => {
  console.error("God's Eye View initialization failed:", error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = t('Error: {message}', {
    message: describeError(error),
  });
  loaderStatus.style.color = '#ff4444';
});

export { application };
