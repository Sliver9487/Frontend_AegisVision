(function () {
  const state = {
    events: [],
    pollTimer: null
  };

  const els = {};
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    registerServiceWorker();
    els.apiBaseUrlInput.value = getApiBaseUrl();
    bindEvents();
    refreshEvents();
    startPolling();
  }

  function cacheElements() {
    [
      "backendStatus", "totalAlerts", "todayAlerts", "latestAlertTime", "apiBaseUrlInput",
      "saveApiUrlBtn", "refreshBtn", "requestNotifyBtn", "testNotifyBtn", "alertList",
      "eventModal", "closeModalBtn", "modalTitle", "modalMeta", "modalSnapshot", "modalDebug", "toast"
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.saveApiUrlBtn.addEventListener("click", () => {
      setApiBaseUrl(els.apiBaseUrlInput.value);
      toast("API Base URL saved.");
      refreshEvents();
      startPolling(true);
    });
    els.refreshBtn.addEventListener("click", refreshEvents);
    els.requestNotifyBtn.addEventListener("click", requestNotificationPermission);
    els.testNotifyBtn.addEventListener("click", testNotification);
    els.closeModalBtn.addEventListener("click", closeModal);
    els.eventModal.addEventListener("click", (event) => {
      if (event.target === els.eventModal) closeModal();
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service Worker registration failed", error);
      });
    }
  }

  async function refreshEvents() {
    try {
      const [health, events] = await Promise.all([getHealth(), getEvents()]);
      setBackendStatus(health?.status === "ok" ? "Online" : "Online", "online");
      state.events = normalizeEvents(events);
      render();
    } catch (error) {
      setBackendStatus("Offline", "offline");
      toast(`Unable to load fall alerts: ${error.message}`);
      state.events = [];
      render();
    }
  }

  function normalizeEvents(events) {
    return [...(events || [])]
      .map(normalizeEvent)
      .filter((event) => event.status === "Fall Detected")
      .sort((a, b) => new Date(b.timestamp || b.lastUpdate) - new Date(a.timestamp || a.lastUpdate));
  }

  function normalizeEvent(event) {
    const legacyTimestamp = parseLegacyTimestamp(event);
    const eventId = event.event_id || `${event.id || event.device_id || "event"}_${(event.timestamp || legacyTimestamp || Date.now()).toString().replace(/[^0-9A-Za-z]/g, "")}`;
    return {
      ...event,
      event_id: eventId,
      device_id: event.device_id || event.id || "unknown",
      source: normalizeSource(event.source),
      status: normalizeStatus(event.status),
      timestamp: event.timestamp || legacyTimestamp || "",
      lastUpdate: event.lastUpdate || event.timestamp || legacyTimestamp || "--",
      snapshot: event.snapshot || event.img || "",
      fall_score: Number(event.fall_score ?? event.debug?.fall_score ?? 0),
      confidence: Number(event.confidence ?? 0),
      debug: event.debug || {}
    };
  }

  function parseLegacyTimestamp(event) {
    const match = (event.img || event.snapshot || "").match(/_(\d{8})_(\d{6})/);
    if (!match) return null;
    const date = match[1];
    const time = match[2];
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  }

  function normalizeStatus(status) {
    return String(status || "").toLowerCase().includes("fall") ? "Fall Detected" : status || "Unknown";
  }

  function normalizeSource(source) {
    return String(source || "camera").toLowerCase() === "screen" ? "screen" : "camera";
  }

  function sourceLabel(source) {
    return normalizeSource(source) === "screen" ? "Screen" : "Camera";
  }

  function render() {
    renderMetrics();
    renderAlerts();
  }

  function renderMetrics() {
    els.totalAlerts.textContent = state.events.length;
    const today = new Date().toISOString().slice(0, 10);
    els.todayAlerts.textContent = state.events.filter((event) => (event.timestamp || "").startsWith(today)).length;
    els.latestAlertTime.textContent = state.events[0] ? formatDate(state.events[0].timestamp || state.events[0].lastUpdate) : "--";
  }

  function renderAlerts() {
    if (!state.events.length) {
      els.alertList.className = "alert-list empty-state";
      els.alertList.textContent = "No fall alerts recorded yet.";
      return;
    }
    els.alertList.className = "alert-list";
    els.alertList.innerHTML = state.events.map((event) => `
      <article class="alert-card" data-event-id="${event.event_id}">
        <img class="alert-snapshot" src="${event.snapshot || "./img/aegisvision.jpeg"}" alt="${event.device_id} fall alert snapshot">
        <div class="alert-body">
          <div class="alert-title-row">
            <h3>${escapeHtml(event.device_id)}</h3>
            <span class="status-pill status-fall">Fall Detected</span>
          </div>
          <p>Source: ${sourceLabel(event.source)}<br>Alert Time: ${formatDate(event.timestamp || event.lastUpdate)}</p>
          <p>Fall Score: ${formatNumber(event.fall_score)} | Confidence: ${formatNumber(event.confidence)}</p>
          <div class="alert-actions">
            <button class="button" data-action="snapshot" data-event-id="${event.event_id}">View Snapshot</button>
          </div>
        </div>
      </article>
    `).join("");
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => openEvent(button.dataset.eventId, button.dataset.action));
    });
  }

  function startPolling(force = false) {
    if (state.pollTimer && !force) return;
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(refreshEvents, 5000);
  }

  function openEvent(eventId) {
    const event = state.events.find((item) => item.event_id === eventId);
    if (!event) return;
    els.modalTitle.textContent = `Fall Alert - ${event.device_id}`;
    els.modalMeta.textContent = `${sourceLabel(event.source)} | ${formatDate(event.timestamp || event.lastUpdate)} | Fall Score ${formatNumber(event.fall_score)}`;
    els.modalSnapshot.src = event.snapshot || "";
    els.modalDebug.textContent = JSON.stringify(event.debug || {}, null, 2);
    els.eventModal.classList.add("open");
  }

  function closeModal() {
    els.eventModal.classList.remove("open");
  }

  function setBackendStatus(text, mode) {
    els.backendStatus.textContent = text;
    els.backendStatus.className = `status-pill ${mode}`;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "--";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value || "--" : date.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }
})();
