# Tally · multicam recording and control

A browser app for multicam shoots: connect every camera and microphone, set each one up from one place, and **record them all, each to its own file, starting on the same frame** — then cut the footage in your editor (Premiere, Resolve, Final Cut…) as a multicam clip.

There's a **demo studio** (7 cameras, 5 mics, Bluetooth accessories) so you can try everything without hardware.

## Pages

- **Live**: every camera, with three views:
  - **Grid**: all cameras, sized to fill the window.
  - **Focus**: one camera large, with zebras, focus peaking, a histogram, framing guides and a readout of its settings.
  - **Switcher**: preview/program, Cut/Auto, transitions, T-bar, title, timecode burn-in, fade to black.

  Next to the views are the camera settings and the audio mixer.
- **Setup**:
  - **Project**: name, take number, notes, demo on/off.
  - **Devices**: everything connected, and every way to add more.
  - **Recording**: folder or downloads, MP4/WebM, bitrate, what gets recorded, storage per hour.
  - **Timecode & sync**: master clock, latency, auto lip-sync, slate, phone clocks.
  - **Shortcuts**.
- **Takes**: every take with its files, sizes, duration and markers.

## Recording

Press **REC** (or `R`). Every armed camera writes its own file, and so does:

- each **microphone** (its own audio file, before the fader);
- the **switched program** (optional);
- **sidecar files**: an EDL of the live cuts, a markers CSV, and a JSON take sheet with start timecode, each device's latency, and the camera settings.

Files are named `Project_T001_C3_Guest_CU_HHMMSSFF.mp4`. In Chrome/Edge they're written straight into a folder you choose, as they record. Other browsers download them when the take ends.

The program mix goes on every camera file as scratch audio, so editors can also sync by waveform. Phones joined over Wi-Fi record their own full-quality copy at the same time.

Each camera can record **clean** (its native signal at full resolution) or **processed** (with this app's adjustments and lip-sync delay). **Marker** (`M`) and **Slate** (`S`: a flash and beep on every camera, mic and phone) mark moments for the edit.

## Camera settings

Each control only appears when the camera supports it:

- **Camera**: name, number, resolution and frame rate, rotation, mirror, torch, flip.
- **Lens**: PTZ joystick and 6 presets, zoom, focus ring with autofocus, iris ring.
- **Exposure**: auto/manual, shutter ring with shutter angle, ISO, ND filter, exposure compensation, with over/under-exposure warnings.
- **Colour**: auto/manual white balance, presets and Kelvin, tint, picture profile (Standard / Flat / Vivid / Mono), saturation, contrast, sharpness. **Match all cameras** copies one camera's look to every camera.

Real cameras are driven through the browser's camera constraints (focus distance, exposure time, ISO, colour temperature, zoom, torch, resolution, frame rate). Demo cameras simulate a lens: depth of field, vignetting, motion blur, grain and ND.

## Connecting devices

| How | What |
| --- | --- |
| **USB & built-in** | Webcams, HDMI/SDI capture cards, USB mics and interfaces. |
| **Phone over Wi-Fi** | Scan a QR code. The phone becomes a camera + mic with a tally border, remote zoom/torch/flip, a synced timecode display, and local recording. Video goes peer-to-peer over WebRTC. |
| **IP camera** | MJPEG / MP4 / HLS URL. RTSP isn't supported in browsers, so restream it through OBS. |
| **Bluetooth** | Paired Bluetooth mics/headsets; BLE accessories with their battery level. |
| **Screen** | A screen, window or tab, with its audio. |

## Layout

The app fills the window at every size:

- **Desktop**: views, camera settings and mixer side by side.
- **Tablet**: camera settings in a drawer.
- **Phone**: one panel at a time, with a bottom tab bar.

Controls get larger on touch screens.

Keyboard:

| Key | Action |
| --- | --- |
| `R` | Record |
| `M` | Marker |
| `S` | Slate |
| `1–9` | Select camera |
| `Shift+1–9` | Cut camera to program |
| `Space` | Cut |
| `Enter` | Auto transition |
| `G` / `V` / `X` | Grid / Focus / Switcher view |
| `F` | Fade to black |
| `L` | Title |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (also on your LAN, for phones)
npm run build    # production build in dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml` → `gh-pages`). Phones need https for the camera, so use the Pages URL for the Wi-Fi feature. To use your own PeerJS signalling server, open the app with `?signal=host:port`.

Best in Chrome or Edge, which add folder recording, Web Bluetooth and the most camera controls.
