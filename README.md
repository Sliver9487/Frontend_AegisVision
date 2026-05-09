# AegisVision Frontend

This folder is the static GitHub Pages frontend for AegisVision.

The AI backend lives separately in `hf_AegisVision_API` and is designed for a Hugging Face Gradio Space. Deploy that backend first, then set the frontend API Base URL to your Space URL.

The preset API URL below is for local testing:

```text
https://lanmai1024-aegisvision-api.hf.space/
```

Local software URL:

```text
https://github.com/Sliver9487/AegisVision
```

API endpoints:

```text
/analyze_frame
/health
/events
/devices
```

Because the test backend is running on CPU only, inference speed and detection quality are greatly reduced compared with a GPU deployment. Use it for basic connectivity testing, not for final performance evaluation.

Do not add `:7860` to the public Hugging Face URL.

## Files

```text
index.html       Dashboard
camera.html      Browser camera client
screen.html      Screen/window capture client
css/             Frontend styles
js/              Static frontend logic
img/             Icons and images
manifest.json    PWA manifest
sw.js            Service worker
```

The frontend calls the Gradio endpoints exposed by the Space listed above.

Camera access and screen capture require HTTPS, so GitHub Pages is the right hosting target for browser testing.
