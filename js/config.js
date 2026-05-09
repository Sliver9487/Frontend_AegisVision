const APP_CONFIG = {
  DEFAULT_API_BASE_URL: "https://lanmai1024-aegisvision-api.hf.space",
  ANALYZE_ENDPOINT: "/analyze_frame",
  HEALTH_ENDPOINT: "/health",
  EVENTS_ENDPOINT: "/events",
  DEVICES_ENDPOINT: "/devices",
  GRADIO_CLIENT_CDN: "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js",
  DEFAULT_INTERVAL_MS: 300,
  DEFAULT_JPEG_QUALITY: 0.7,
  DEFAULT_RESOLUTION: "480p"
};

function getApiBaseUrl() {
  return (localStorage.getItem("apiBaseUrl") || APP_CONFIG.DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function setApiBaseUrl(url) {
  localStorage.setItem("apiBaseUrl", url.trim().replace(/\/$/, ""));
}

function buildApiUrl(endpoint) {
  return `${getApiBaseUrl()}${endpoint}`;
}


