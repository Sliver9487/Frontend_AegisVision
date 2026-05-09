(function () {
  const RESOLUTIONS = {
    "320p": { width: 480, height: 320 },
    "480p": { width: 854, height: 480 },
    "720p": { width: 1280, height: 720 }
  };

  const state = {
    stream: null,
    detectionTimer: null,
    isProcessing: false,
    running: false,
    sent: 0,
    success: 0,
    failed: 0,
    totalLatency: 0
  };

  const els = {};
  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopDetectionLoop(false);
      setDetectionStatus("paused");
    }
  });

  function init() {
    cacheElements();
    loadSettings();
    bindEvents();
    enumerateCameras();
    updateVideoVisibility();
  }

  function cacheElements() {
    [
      "connectionStatus", "activeDeviceLabel", "deviceIdInput", "apiBaseUrlInput", "cameraSelect",
      "intervalSelect", "qualitySelect", "resolutionSelect", "showVideoToggle", "startCameraBtn",
      "stopCameraBtn", "switchCameraBtn", "startDetectionBtn", "pauseDetectionBtn", "saveSettingsBtn",
      "video", "canvas", "videoPlaceholder", "detectionStatus", "aiResult", "lastDetectionTime",
      "latency", "sentFrames", "successCount", "failedCount", "avgResponseTime", "errorMessage",
      "aiPreview", "aiPreviewPlaceholder"
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.startCameraBtn.addEventListener("click", () => startCamera());
    els.stopCameraBtn.addEventListener("click", stopCamera);
    els.switchCameraBtn.addEventListener("click", () => startCamera(els.cameraSelect.value));
    els.startDetectionBtn.addEventListener("click", startDetectionLoop);
    els.pauseDetectionBtn.addEventListener("click", () => stopDetectionLoop(true));
    els.saveSettingsBtn.addEventListener("click", saveSettings);
    els.showVideoToggle.addEventListener("change", () => {
      updateVideoVisibility();
      saveSettings();
    });
    els.deviceIdInput.addEventListener("input", () => {
      els.activeDeviceLabel.textContent = `Device: ${getDeviceId()}`;
    });
  }

  function loadSettings() {
    els.deviceIdInput.value = localStorage.getItem("deviceId") || "Room-01";
    els.apiBaseUrlInput.value = getApiBaseUrl();
    els.intervalSelect.value = localStorage.getItem("intervalMs") || APP_CONFIG.DEFAULT_INTERVAL_MS;
    els.qualitySelect.value = localStorage.getItem("jpegQuality") || APP_CONFIG.DEFAULT_JPEG_QUALITY;
    els.resolutionSelect.value = localStorage.getItem("resolution") || APP_CONFIG.DEFAULT_RESOLUTION;
    els.showVideoToggle.checked = localStorage.getItem("showVideo") !== "false";
    els.activeDeviceLabel.textContent = `Device: ${getDeviceId()}`;
  }

  function saveSettings() {
    localStorage.setItem("deviceId", getDeviceId());
    setApiBaseUrl(els.apiBaseUrlInput.value || APP_CONFIG.DEFAULT_API_BASE_URL);
    localStorage.setItem("intervalMs", els.intervalSelect.value);
    localStorage.setItem("jpegQuality", els.qualitySelect.value);
    localStorage.setItem("resolution", els.resolutionSelect.value);
    localStorage.setItem("selectedCameraId", els.cameraSelect.value || "");
    localStorage.setItem("showVideo", String(els.showVideoToggle.checked));
    setMessage("Settings saved.");
  }

  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      els.cameraSelect.innerHTML = cameras.map((camera, index) => (
        `<option value="${camera.deviceId}">${camera.label || `Camera ${index + 1}`}</option>`
      )).join("");
      const savedCamera = localStorage.getItem("selectedCameraId");
      if (savedCamera) els.cameraSelect.value = savedCamera;
    } catch (error) {
      setMessage(`Unable to list cameras: ${error.message}`, true);
    }
  }

  async function startCamera(deviceId = els.cameraSelect.value) {
    stopCamera();
    const resolution = RESOLUTIONS[els.resolutionSelect.value] || RESOLUTIONS["480p"];
    const videoConstraint = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: resolution.width }, height: { ideal: resolution.height } }
      : { facingMode: "environment", width: { ideal: resolution.width }, height: { ideal: resolution.height } };

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: false });
      els.video.srcObject = state.stream;
      setConnection("Camera Ready", "online");
      setMessage("");
      await enumerateCameras();
      saveSettings();
      updateVideoVisibility();
    } catch (error) {
      setConnection("Camera Error", "offline");
      setDetectionStatus("error");
      setMessage(`Camera access failed: ${error.message}`, true);
    }
  }

  function stopCamera() {
    stopDetectionLoop(false);
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    els.video.srcObject = null;
    setConnection("Idle", "offline");
    setDetectionStatus("idle");
    updateVideoVisibility();
  }

  function startDetectionLoop() {
    if (!state.stream) {
      setMessage("Start the camera before detection.", true);
      return;
    }
    saveSettings();
    if (state.detectionTimer) return;
    state.running = true;
    setDetectionStatus("running");
    state.detectionTimer = setInterval(processFrame, Number(els.intervalSelect.value));
    processFrame();
  }

  function stopDetectionLoop(markPaused) {
    state.running = false;
    if (state.detectionTimer) {
      clearInterval(state.detectionTimer);
      state.detectionTimer = null;
    }
    if (markPaused) setDetectionStatus("paused");
  }

  async function processFrame() {
    if (!state.running || state.isProcessing || document.hidden || els.video.readyState < 2) return;
    state.isProcessing = true;
    state.sent += 1;
    updateStats();

    const started = performance.now();
    try {
      const image = captureFrame();
      const result = await analyzeFrame({
        image,
        id: getDeviceId(),
        source: "camera",
        client_time: new Date().toISOString()
      });
      console.log("[CAMERA_RESULT]", result);
      const elapsed = Math.round(performance.now() - started);
      state.success += 1;
      state.totalLatency += elapsed;
      setConnection("Connected", "online");
      setAiResult(result.status || "Normal");
      updateAiPreview(result.image);
      els.lastDetectionTime.textContent = new Date().toLocaleTimeString();
      els.latency.textContent = `${result.latency_ms ?? elapsed}ms`;
      if (result.status === "Error") {
        console.error("[AI_ANALYSIS_ERROR]", result.debug);
        setMessage(result.debug?.error || result.debug?.message || "Error during AI analysis", true);
      } else {
        setMessage("");
      }
    } catch (error) {
      state.failed += 1;
      setConnection("Connection Lost", "offline");
      setAiResult("Connection Lost");
      setMessage(`Detection request failed: ${error.message}`, true);
    } finally {
      state.isProcessing = false;
      updateStats();
    }
  }

  function captureFrame() {
    const resolution = RESOLUTIONS[els.resolutionSelect.value] || RESOLUTIONS["480p"];
    const sourceWidth = els.video.videoWidth || resolution.width;
    const sourceHeight = els.video.videoHeight || resolution.height;
    const scale = Math.min(resolution.width / sourceWidth, resolution.height / sourceHeight, 1);
    els.canvas.width = Math.round(sourceWidth * scale);
    els.canvas.height = Math.round(sourceHeight * scale);
    const ctx = els.canvas.getContext("2d");
    ctx.drawImage(els.video, 0, 0, els.canvas.width, els.canvas.height);
    return els.canvas.toDataURL("image/jpeg", Number(els.qualitySelect.value));
  }

  function updateStats() {
    els.sentFrames.textContent = state.sent;
    els.successCount.textContent = state.success;
    els.failedCount.textContent = state.failed;
    els.avgResponseTime.textContent = state.success ? `${Math.round(state.totalLatency / state.success)}ms` : "--";
  }

  function updateAiPreview(image) {
    if (!image) return;
    els.aiPreview.src = image;
    els.aiPreviewPlaceholder.classList.remove("visible");
  }

  function updateVideoVisibility() {
    const show = els.showVideoToggle.checked && Boolean(state.stream);
    els.video.classList.toggle("hidden-feed", !show);
    els.videoPlaceholder.classList.toggle("visible", !show);
  }

  function getDeviceId() {
    return (els.deviceIdInput.value || "Room-01").trim();
  }

  function setConnection(text, mode) {
    els.connectionStatus.textContent = text;
    els.connectionStatus.className = `status-pill ${mode}`;
  }

  function setDetectionStatus(text) {
    els.detectionStatus.textContent = text;
  }

  function setAiResult(status) {
    els.aiResult.textContent = status;
    els.aiResult.className = "";
    if (status === "Fall Detected") els.aiResult.classList.add("status-fall");
    else if (status === "Abnormal Posture") els.aiResult.classList.add("status-abnormal");
    else if (status === "Normal") els.aiResult.classList.add("status-normal");
    else els.aiResult.classList.add("status-offline");
  }

  function setMessage(message, isError = false) {
    els.errorMessage.textContent = message;
    els.errorMessage.style.color = isError ? "var(--red)" : "var(--green)";
  }
})();
