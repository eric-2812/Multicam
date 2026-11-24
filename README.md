# Tally · multicam recording and control

A browser app for multicam shoots: connect every camera and microphone, set each one up from one place, and **record them all, each to its own file, starting on the same frame** — then cut the footage in your editor (Premiere, Resolve, Final Cut…) as a multicam clip.

## Pages

- **Live**: every camera, with three views:
  - **Grid**: all cameras, sized to fill the window.
  - **Focus**: one camera large, with zebras, focus peaking, a histogram, framing guides and a readout of its settings.
  - **Switcher**: preview/program, Cut/Auto, transitions, T-bar, title, timecode burn-in, fade to black.

  Next to the views are the camera settings and the audio mixer.
- **Setup**:
  - **Project**: name, take number, notes.
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

Controls appear only when the camera supports them, driven through the browser's camera constraints. Cameras are opened with PTZ permission so pan, tilt and zoom are reported, and every other setting a camera exposes (brightness, contrast, background blur, face framing…) gets its own control under **Camera hardware**.

## Connecting devices

### iPhone, GoPro and Sony Alpha

| Camera | Picture into Tally | Recording on the camera |
| --- | --- | --- |
| **iPhone** | Continuity Camera on a Mac (shows up as “iPhone Camera”), or the Wi-Fi link in Safari on any computer | Over Wi-Fi the iPhone records its own full-quality file with each take |
| **GoPro** (HERO8+) | Webcam mode over USB-C with the GoPro Webcam app (up to 1080p), or HDMI with the Media Mod into a capture card | Pair over Bluetooth (HERO9+, Open GoPro API): it records to its card with REC; battery and recording state are shown |
| **Sony Alpha** (a7 IV, a7S III, FX3, ZV…) | USB Streaming (UVC/UAC, 4K on a 10 Gbps port, 720p on USB 2), or clean HDMI into a capture card | Pair as a Bluetooth remote (“Bluetooth Rmt Ctrl” on): it starts and stops recording to its card with REC |

Bluetooth control needs Chrome or Edge (Mac, Windows, ChromeOS, Android). The Sony protocol is the one Sony's RMT-P1BT remote uses, documented by the community and confirmed on the a7 III and ZV-1F; it has not been tested on an a7 IV yet.

### Everything else

| How | What |
| --- | --- |
| **USB & built-in** | Webcams, HDMI/SDI capture cards, USB mics and interfaces. |
| **Android / any phone over Wi-Fi** | Scan a QR code. The phone becomes a camera + mic with a tally border, remote zoom/torch/flip, a synced timecode display, and local recording. Video goes peer-to-peer over WebRTC. |
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
