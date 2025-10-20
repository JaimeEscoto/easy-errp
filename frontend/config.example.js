(function () {
  // La URL del backend se puede definir mediante la variable de entorno BACKEND_URL,
  // la cual se vuelca en window.ENV por el script frontend/scripts/generate-env.js.
  const fallbackBackendUrl = 'http://localhost:4000';

  const envBackendUrl =
    typeof window !== 'undefined' &&
    window.ENV &&
    typeof window.ENV.BACKEND_URL === 'string'
      ? window.ENV.BACKEND_URL.trim()
      : '';

  const backendUrl = envBackendUrl || fallbackBackendUrl;

  window.APP_CONFIG = {
    backendUrl,
  };
})();
