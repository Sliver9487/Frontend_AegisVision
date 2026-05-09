async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

let gradioClientPromise = null;
let gradioClientBaseUrl = null;

async function getGradioClient() {
  const baseUrl = getApiBaseUrl();
  if (!gradioClientPromise || gradioClientBaseUrl !== baseUrl) {
    gradioClientBaseUrl = baseUrl;
    gradioClientPromise = import(APP_CONFIG.GRADIO_CLIENT_CDN)
      .then(({ Client }) => Client.connect(baseUrl));
  }
  return gradioClientPromise;
}

function unwrapGradioResponse(response, fallback) {
  if (Array.isArray(response?.data)) return response.data[0] ?? fallback;
  return response ?? fallback;
}

async function callGradioApi(endpoint, payload = {}) {
  try {
    const client = await getGradioClient();
    const response = await client.predict(endpoint, payload);
    return unwrapGradioResponse(response, null);
  } catch (error) {
    console.warn("Gradio client failed, falling back to REST API", error);
    return callGradioRest(endpoint, payload);
  }
}

async function callGradioRest(endpoint, payload = {}) {
  const apiName = endpoint.replace(/^\//, "");
  const submit = await fetchJson(`${getApiBaseUrl()}/gradio_api/call/${apiName}`, {
    method: "POST",
    body: JSON.stringify({ data: payloadToData(apiName, payload) })
  });
  const eventId = submit?.event_id;
  if (!eventId) return null;

  const response = await fetch(`${getApiBaseUrl()}/gradio_api/call/${apiName}/${eventId}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  const lastLine = dataLines[dataLines.length - 1];
  return lastLine ? unwrapGradioResponse({ data: JSON.parse(lastLine) }, null) : null;
}

function payloadToData(apiName, payload) {
  if (apiName === "analyze_frame") {
    return [
      payload.image,
      payload.device_id || "unknown",
      payload.source || "camera",
      Boolean(payload.high_sensitivity)
    ];
  }
  return [];
}

function getHealth() {
  return callGradioApi(APP_CONFIG.HEALTH_ENDPOINT);
}

function getEvents() {
  return callGradioApi(APP_CONFIG.EVENTS_ENDPOINT).then((events) => events || []);
}

function getDevices() {
  return callGradioApi(APP_CONFIG.DEVICES_ENDPOINT).then((devices) => devices || []);
}

function analyzeFrame(payload) {
  return callGradioApi(APP_CONFIG.ANALYZE_ENDPOINT, {
    image: payload.image,
    device_id: payload.id || payload.device_id || "unknown",
    source: payload.source || "camera",
    high_sensitivity: Boolean(payload.high_sensitivity)
  });
}

