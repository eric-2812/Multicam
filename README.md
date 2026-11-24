# Tally · multicam control

A multicam control room that runs in the browser. Connect cameras and microphones over USB, Wi-Fi and Bluetooth, watch every feed live, switch between them, drive the lenses and mix the audio — then record the program.

**Demo mode** loads a simulated talk show (7 cameras, 5 mics, Bluetooth accessories), so you can try everything without plugging anything in.

## What it does

- **Live switcher** — preview / program monitors, Cut, Auto, Mix / Dip / Wipe / Push transitions, a T-bar, fade to black and a lower-third title.
- **Multiview** — every source live with tally (red = on air, green = preview), connection type, battery and Wi-Fi signal.
- **Camera control** — PTZ joystick and 6 presets per camera, zoom, white balance, exposure, saturation, contrast, mirror, torch.
- **Lens rings** — focus, aperture and shutter rings that only show up when the camera supports them. Real cameras get the hardware controls the browser exposes (manual focus and shutter on many phones and some webcams); demo cameras simulate a real lens: depth of field, wide-open vignetting, motion blur on slow shutters and auto-ISO grain.
- **Audio mixer** — a channel strip per mic with meters, fader, pan, mute, solo and audio-follows-video; master meters and "Listen".
- **Record** the program (video + mix) to MP4/WebM, or grab a still.
- **Timestamp sync** — one master timecode (time of day or record-run, 25/30 fps) for everything:
  - per-device latency (measured from frame capture times where the browser reports them, estimated otherwise) and **Auto-align**, which delays the faster cameras and mics to match the slowest so picture and sound stay in lip sync;
  - phones sync their clocks to the control room over Wi-Fi (NTP-style) and show the master timecode on screen;
  - **Slate** (`S`): one white flash + beep on every camera, the mix and every phone, for lining up footage;
  - timecode burn-in, **ISO recording** of every camera starting on the same frame, and an **EDL + CSV cut list** saved with each recording.

## Connecting devices

| How | What |
| --- | --- |
| **USB & built-in** | Webcams, HDMI/SDI capture cards, USB mics and interfaces. |
| **Phone over Wi-Fi** | Scan the QR code on a phone: it becomes a wireless camera + mic, with a tally border and remote zoom / torch / flip. Video goes peer-to-peer (WebRTC); the public PeerJS broker is only used for the handshake. |
| **IP camera** | Any MJPEG / MP4 / HLS URL. (Browsers can't play RTSP — restream through OBS and use its virtual camera.) |
| **Bluetooth** | Bluetooth mics/headsets once paired with the computer; BLE accessories (remotes, gimbals) via Web Bluetooth with battery level. Bluetooth can't carry live video, so wireless cameras use Wi-Fi. |
| **Screen** | A screen, window or tab, with its audio. |

Keyboard: `1–9` preview, `Shift+1–9` take to program, `Space` cut, `Enter` auto, `R` record, `F` fade to black, `L` lower third, `S` slate, `?` help.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (also on your LAN, for phones)
npm run build    # production build in dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml` → `gh-pages` branch). Phones need https to use the camera, so use the Pages URL (or another https host) for the Wi-Fi feature.

To use your own signalling server instead of the public one, run a [PeerJS server](https://github.com/peers/peerjs-server) and open the app with `?signal=host:port`.

Best in Chrome or Edge (Web Bluetooth, hardware lens controls, MP4 recording). Safari and Firefox work for everything except Web Bluetooth.
