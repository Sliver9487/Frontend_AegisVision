(function () {
  const RESOLUTIONS = {
    original: null,
    "720p": { width: 1280, height: 720 },
    "480p": { width: 854, height: 480 },
    "320p": { width: 480, height: 320 }
  };

  const MAX_UNSTABLE_FAILURES = 5;
  const MAX_PAUSE_FAILURES = 20;
  const BACKGROUND_INTERVAL_MS = 1000;

  const state = {
    screenStream: null,
    detectionTimer: null,
    isCapturing: false,
    isDetecting: false,
    shouldResumeDetection: false,
    isProcessing: false,
    isBackgroundMode: false,
    lastFrameSentAt: 0,
    lastSuccessfulFrameTime: null,
    consecutiveFailures: 0,
    sent: 0,
    skipped: 0,
    success: 0,
    failed: 0,
    totalLatency: 0
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("beforeunload", stopScreenCapture);
  document.addEventListener("visibilitychange", () => {
    setBackgroundMode(document.hidden);
    if (!document.hidden) ensureDetectionLoopRunning();
  });

  function init() {
    cacheElements();
    loadSettings();
    bindEvents();
    updatePreviewVisibility();
  }

  function cacheElements() {
    [
      "connectionStatus", "activeDeviceLabel", "deviceIdInput", "apiBaseUrlInput", "captureModeInput",
      "intervalSelect", "qualitySelect", "resolutionSelect", "showPreviewToggle", "highSensitivityToggle",
      "startCaptureBtn", "stopCaptureBtn", "startDetectionBtn", "pauseDetectionBtn", "saveSettingsBtn",
      "video", "canvas", "videoPlaceholder", "captureStatus", "detectionStatus", "aiResult",
      "lastDetectionTime", "latency", "sentFrames", "skippedFrames", "successCount", "failedCount",
      "avgResponseTime", "lastSuccessfulFrameTime", "errorMessage", "aiPreview", "aiPreviewPlaceholder"
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.startCaptureBtn.addEventListener("click", startScreenCapture);
    els.stopCaptureBtn.addEventListener("click", stopScreenCapture);
    els.startDetectionBtn.addEventListener("click", startDetectionLoop);
    els.pauseDetectionBtn.addEventListener("click", () => stopDetectionLoop(true));
    els.saveSettingsBtn.addEventListener("click", saveSettings);
    els.showPreviewToggle.addEventListener("change", () => {
      updatePreviewVisibility();
      saveSettings();
    });
    els.highSensitivityToggle.addEventListener("change", () => {
      applyHighSensitivityMode();
      saveSettings();
      restartDetectionTimerIfRunning();
    });
    els.intervalSelect.addEventListener("change", restartDetectionTimerIfRunning);
    els.deviceIdInput.addEventListener("input", () => {
      els.activeDeviceLabel.textContent = `Device: ${getDeviceId()}`;
    });
  }

  function loadSettings() {
    els.deviceIdInput.value = localStorage.getItem("screenDeviceId") || "Desktop-01";
    els.apiBaseUrlInput.value = getApiBaseUrl();
    els.intervalSelect.value = localStorage.getItem("screenIntervalMs") || "300";
    els.qualitySelect.value = localStorage.getItem("screenJpegQuality") || "0.7";
    els.resolutionSelect.value = localStorage.getItem("screenResolution") || "480p";
    els.showPreviewToggle.checked = localStorage.getItem("showScreenPreview") !== "false";
    els.highSensitivityToggle.checked = localStorage.getItem("screenHighSensitivity") === "true";
    if (els.highSensitivityToggle.checked) applyHighSensitivityMode();
    els.activeDeviceLabel.textContent = `Device: ${getDeviceId()}`;
  }

  function saveSettings() {
    localStorage.setItem("screenDeviceId", getDeviceId());
    setApiBaseUrl(els.apiBaseUrlInput.value || APP_CONFIG.DEFAULT_API_BASE_URL);
    localStorage.setItem("screenIntervalMs", els.intervalSelect.value);
    localStorage.setItem("screenJpegQuality", els.qualitySelect.value);
    localStorage.setItem("screenResolution", els.resolutionSelect.value);
    localStorage.setItem("showScreenPreview", String(els.showPreviewToggle.checked));
    localStorage.setItem("screenHighSensitivity", String(els.highSensitivityToggle.checked));
    setMessage("Settings saved.");
  }

  async function startScreenCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureStatus("error");
      setConnection("Unsupported", "offline");
      setMessage("This browser does not support screen capture.", true);
      return;
    }

    stopScreenCapture();
    saveSettings();

    try {
      state.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 }
        },
        audio: false
      });

      els.video.srcObject = state.screenStream;
      await els.video.play();

      state.isCapturing = true;
      const track = state.screenStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          stopScreenCapture();
          setCaptureStatus("stopped");
          setMessage("Screen sharing stopped by the browser.");
        };
        updateCaptureMode(track);
      }

      setCaptureStatus("capturing");
      setConnection("Capturing", "online");
      setMessage("");
      updatePreviewVisibility();
    } catch (error) {
      state.isCapturing = false;
      state.screenStream = null;
      els.video.srcObject = null;
      setCaptureStatus(error.name === "NotAllowedError" || error.name === "AbortError" ? "idle" : "error");
      setConnection("Idle", "offline");
      setMessage("Screen capture was cancelled or failed. Click Start Screen Capture and choose a source.", true);
      updatePreviewVisibility();
    }
  }

  function stopScreenCapture() {
    stopDetectionLoop(false, "idle");
    if (state.screenStream) {
      state.screenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    state.screenStream = null;
    state.isCapturing = false;
    state.shouldResumeDetection = false;
    els.video.srcObject = null;
    setCaptureStatus("stopped");
    setConnection("Stopped", "offline");
    updatePreviewVisibility();
  }

  function startDetectionLoop() {
    if (!state.screenStream || !state.isCapturing || !state.screenStream.active) {
      setMessage("Please start screen capture first.", true);
      return;
    }

    saveSettings();
    state.isDetecting = true;
    state.shouldResumeDetection = true;
    setDetectionStatus("running");
    setMessage("");

    if (state.detectionTimer) return;
    state.detectionTimer = setInterval(captureAndSendFrame, getEffectiveIntervalMs());
    captureAndSendFrame();
  }

  function stopDetectionLoop(markPaused = true, status = "paused") {
    if (state.detectionTimer) {
      clearInterval(state.detectionTimer);
      state.detectionTimer = null;
    }
    state.isDetecting = false;
    state.shouldResumeDetection = false;
    state.isProcessing = false;
    setDetectionStatus(markPaused ? status : status);
  }

  async function captureAndSendFrame() {
    if (!state.isDetecting || !state.isCapturing || !state.screenStream || !state.screenStream.active) return;
    if (state.isProcessing) {
      state.skipped += 1;
      updateStats();
      setMessage("Backend is slow, skipping frames to stay real-time.", true);
      return;
    }
    if (els.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      state.skipped += 1;
      updateStats();
      return;
    }

    state.isProcessing = true;
    state.sent += 1;
    state.lastFrameSentAt = Date.now();
    updateStats();

    const startedAt = performance.now();
    try {
      const image = captureFrame();
      const result = await analyzeFrame({
        image,
        id: getDeviceId(),
        source: "screen",
        high_sensitivity: els.highSensitivityToggle.checked,
        client_time: new Date().toISOString()
      });
      console.log("[SCREEN_RESULT]", result);
      if (result.status === "Error") {
        console.warn("[SCREEN_ERROR_STATUS]", result.debug);
      }
      const latency = Math.round(performance.now() - startedAt);
      state.success += 1;
      state.totalLatency += latency;
      state.consecutiveFailures = 0;
      state.lastSuccessfulFrameTime = new Date();
      setConnection("Online", "online");
      setAiResult(result.status || "No Person");
      updateAiPreview(result.image);
      els.lastDetectionTime.textContent = new Date().toLocaleTimeString();
      els.latency.textContent = `${result.latency_ms ?? latency}ms`;
      if (result.status === "Error") {
        console.error("[AI_ANALYSIS_ERROR]", result.debug);
        setMessage(result.debug?.error || result.debug?.message || "Error during AI analysis", true);
      } else {
        setMessage("");
      }
    } catch (error) {
      state.failed += 1;
      state.consecutiveFailures += 1;
      setAiResult("Connection Lost");
      if (state.consecutiveFailures > MAX_PAUSE_FAILURES) {
        setConnection("Server Unreachable", "offline");
        setMessage("Server unreachable after repeated attempts. Detection paused, screen capture is still active.", true);
        stopDetectionLoop(true, "paused");
      } else if (state.consecutiveFailures > MAX_UNSTABLE_FAILURES) {
        setConnection("Connection Unstable", "offline");
        setMessage("Connection unstable. Continuing to retry while keeping screen capture active.", true);
      } else {
        setConnection("Connection Lost", "offline");
        setMessage(`Detection request failed: ${error.message}`, true);
      }
    } finally {
      state.isProcessing = false;
      updateStats();
    }
  }

  function captureFrame() {
    const sourceWidth = els.video.videoWidth || 1280;
    const sourceHeight = els.video.videoHeight || 720;
    const resolution = RESOLUTIONS[els.resolutionSelect.value];
    let width = sourceWidth;
    let height = sourceHeight;

    if (resolution) {
      const scale = Math.min(resolution.width / sourceWidth, resolution.height / sourceHeight, 1);
      width = Math.round(sourceWidth * scale);
      height = Math.round(sourceHeight * scale);
    }

    els.canvas.width = width;
    els.canvas.height = height;
    const ctx = els.canvas.getContext("2d");
    ctx.drawImage(els.video, 0, 0, width, height);
    return els.canvas.toDataURL("image/jpeg", getJpegQuality());
  }

  function setBackgroundMode(isBackground) {
    if (state.isBackgroundMode === isBackground) return;
    state.isBackgroundMode = isBackground;
    if (state.isDetecting && state.detectionTimer) {
      clearInterval(state.detectionTimer);
      state.detectionTimer = null;
      state.detectionTimer = setInterval(captureAndSendFrame, getEffectiveIntervalMs());
    }
    if (isBackground) {
      setMessage("Page is in background; screen detection continues at a lower rate.");
    }
  }

  function ensureDetectionLoopRunning() {
    if (state.screenStream && state.screenStream.active && els.video.srcObject !== state.screenStream) {
      els.video.srcObject = state.screenStream;
      els.video.play().catch(() => {});
    }
    if (state.isCapturing && state.shouldResumeDetection && state.screenStream?.active && !state.detectionTimer) {
      state.isDetecting = true;
      state.detectionTimer = setInterval(captureAndSendFrame, getEffectiveIntervalMs());
      setDetectionStatus("running");
      captureAndSendFrame();
    }
  }

  function restartDetectionTimerIfRunning() {
    if (!state.isDetecting || !state.detectionTimer) return;
    clearInterval(state.detectionTimer);
    state.detectionTimer = null;
    state.detectionTimer = setInterval(captureAndSendFrame, getEffectiveIntervalMs());
  }

  function applyHighSensitivityMode() {
    if (!els.highSensitivityToggle.checked) return;
    els.intervalSelect.value = "200";
    els.qualitySelect.value = "0.7";
    els.resolutionSelect.value = "480p";
  }

  function getEffectiveIntervalMs() {
    return state.isBackgroundMode ? Math.max(Number(els.intervalSelect.value), BACKGROUND_INTERVAL_MS) : Number(els.intervalSelect.value);
  }

  function getJpegQuality() {
    return Number(els.qualitySelect.value || 0.7);
  }

  function updateCaptureMode(track) {
    const settings = track.getSettings ? track.getSettings() : {};
    const displaySurface = settings.displaySurface || "screen";
    const labelMap = {
      monitor: "Screen",
      window: "Window",
      browser: "Browser Tab",
      application: "Application Window",
      screen: "Screen"
    };
    els.captureModeInput.value = labelMap[displaySurface] || "Screen / Window / Browser Tab";
  }

  function updateStats() {
    els.sentFrames.textContent = state.sent;
    els.skippedFrames.textContent = state.skipped;
    els.successCount.textContent = state.success;
    els.failedCount.textContent = state.failed;
    els.avgResponseTime.textContent = state.success ? `${Math.round(state.totalLatency / state.success)}ms` : "--";
    els.lastSuccessfulFrameTime.textContent = state.lastSuccessfulFrameTime ? state.lastSuccessfulFrameTime.toLocaleTimeString() : "--";
  }

  function updateAiPreview(image) {
    if (!image) return;
    els.aiPreview.src = image;
    els.aiPreviewPlaceholder.classList.remove("visible");
  }

  function updatePreviewVisibility() {
    const show = els.showPreviewToggle.checked && Boolean(state.screenStream);
    els.video.classList.toggle("preview-hidden", !show);
    els.videoPlaceholder.classList.toggle("visible", !show);
  }

  function getDeviceId() {
    return (els.deviceIdInput.value || "Desktop-01").trim();
  }

  function setConnection(text, mode) {
    els.connectionStatus.textContent = text;
    els.connectionStatus.className = `status-pill ${mode}`;
  }

  function setCaptureStatus(text) {
    els.captureStatus.textContent = text;
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
