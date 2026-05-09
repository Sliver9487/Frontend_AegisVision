async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

async function showFallNotification(title, body, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const payload = {
    body,
    icon: "./img/aegisvision.ico",
    badge: "./img/aegisvision.ico",
    tag: options.tag || "aegisvision-fall-alert",
    requireInteraction: true,
    data: options.data || {}
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      registration.showNotification(title, payload);
      return;
    }
  }
  new Notification(title, payload);
}

function testNotification() {
  showFallNotification("NeuraClip Test Alert", "Browser notifications are ready for fall alerts.", {
    tag: "aegisvision-test"
  });
}
