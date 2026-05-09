# AegisVision Frontend

This folder is the static GitHub Pages frontend for AegisVision.

The AI backend lives separately in `hf_AegisVision_API` and is designed for a Hugging Face Gradio Space. Deploy that backend first, then set the frontend API Base URL to your Space URL, for example:

```text
https://your-space-name.hf.space
```

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

## GitHub Pages

1. Push this `Pages` folder to the GitHub Pages repository or branch.
2. In GitHub, open **Settings > Pages**.
3. Select the branch that contains these files.
4. Select the folder that contains `index.html`.
5. Open the published Pages URL.
6. Enter your Hugging Face Space URL in **API Base URL** and save it.

The frontend calls the Gradio endpoints exposed by the Space:

```text
/analyze_frame
/health
/events
/devices
```

Camera access and screen capture require HTTPS, so GitHub Pages is the right hosting target for browser testing.
