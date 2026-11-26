# Cortiva · multicam recording and control

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

### iPhone, GoPro, Sony, Canon, Nikon, Fujifilm and Lumix

| Camera | Picture into Cortiva | Recording on the camera |
| --- | --- | --- |
| **iPhone** | Continuity Camera on a Mac (shows up as “iPhone Camera”), or the Wi-Fi link in Safari on any computer | Over Wi-Fi the iPhone records its own full-quality file with each take |
| **GoPro** (HERO8+) | Webcam mode over USB-C with the GoPro Webcam app (up to 1080p), or HDMI with the Media Mod into a capture card | Pair over Bluetooth (HERO9+, Open GoPro API): it records to its card with REC; battery and recording state are shown |
| **Sony Alpha** (a7 IV, a7S III, FX3, ZV…) | USB Streaming (UVC/UAC, 4K on a 10 Gbps port, 720p on USB 2), or clean HDMI into a capture card | Pair as a Bluetooth remote (“Bluetooth Rmt Ctrl” on): it starts and stops recording to its card with REC |
| **Canon** (EOS R / PowerShot) | Recent models (R8, R5 Mark II…) are UVC/UAC webcams on their own; others through EOS Webcam Utility; or clean HDMI into a capture card | — |
| **Nikon** (Z / DSLR) | Z6III (fw 2.0+), Z f, Z50II: “USB streaming (UVC/UAC)”; others through Nikon Webcam Utility; or clean HDMI | — |
| **Fujifilm** (X / GFX) | Newer models: connection mode “USB WEBCAM”; older: FUJIFILM X Webcam; or clean HDMI | — |
| **Panasonic Lumix** | Newer models: USB mode “PC (Webcam)”; older: LUMIX Webcam Software (beta); or clean HDMI | — |

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

Keyboard (default keys — change any of them in **Setup → Shortcuts**):

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
| `.` / `,` | Next / previous camera |
| `C` / `Shift+C` | Shutter faster / slower (selected camera) |
| `I` / `Shift+I` | ISO up / down |
| `E` / `Shift+E` | Exposure ± ⅓ stop |
| `A` / `Shift+A` | Iris: higher / lower f-number |
| `N` / `Shift+N` | ND filter stronger / weaker |
| `D` / `Shift+D` | Focus farther / nearer |
| `Z` / `Shift+Z` | Zoom in / out |
| `W` / `Shift+W` | White balance ± 100 K |

Camera keys work on the selected camera, only for controls its hardware has, and show the new value on screen.

## Download (Windows)

Get the latest beta from the [Releases page](https://github.com/eric-2812/cortiva/releases): the installer (`Cortiva-Setup-<version>.exe`) or the single-file portable `.exe`. It isn't code-signed yet, so SmartScreen may warn on first run — **More info → Run anyway**. Recordings without a chosen folder go to **Videos\Cortiva**. From 0.10 the installed app updates itself (it downloads new releases in the background and installs them when it closes, or at once with *Restart to update*); the portable `.exe` tells you when a new one is out. See the [code signing policy](#code-signing-policy).

Every change ships as a new release (and the website is updated with it): bump `version` in `package.json` (`0.2.0-beta`, `0.3.0-beta`…), describe the change in a new section at the top of [`CHANGELOG.md`](CHANGELOG.md), push, then run **Release (Windows)** from the Actions tab. It builds the Windows app, publishes a new release named after the version with that changelog section as its notes, and refuses to overwrite a version that was already released.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (also on your LAN, for phones)
npm run build    # production build in dist/
npm run app      # run the desktop app (Electron)
npm run dist:win # build the Windows .exe files into release/ (on Windows)
```

Each release also publishes the website to GitHub Pages (`gh-pages`); `.github/workflows/pages.yml` re-publishes it by hand. Phones need https for the camera, so use the Pages URL for the Wi-Fi feature. To use your own PeerJS signalling server, open the app with `?signal=host:port`.

Best in Chrome or Edge, which add folder recording, Web Bluetooth and the most camera controls.

## Code signing policy

Windows releases are built from this repository's source by GitHub Actions ([`release.yml`](.github/workflows/release.yml)) — never on a personal computer — and published to the [Releases page](https://github.com/eric-2812/cortiva/releases) together with the website, from the same commit.

Signing is being set up with the SignPath Foundation's free programme for open-source projects. Once it is in place: free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

Team roles:

- Committers and reviewers: [eric-2812](https://github.com/eric-2812)
- Approvers (every signed release is approved by hand): [eric-2812](https://github.com/eric-2812)

All team members use multi-factor authentication on GitHub and SignPath. Only the binaries built by the release workflow from this repository are signed — no third-party programs.

## Privacy

Cortiva has no accounts, no analytics and no server of its own, and it never uploads recordings. Everything — recordings, settings, shortcuts — stays on the computer or phone that made it.

It only connects to other systems when you ask it to, plus one update check:

- **Updates** (installed desktop app only): it checks this repository's GitHub Releases when it opens and every 4 hours, and downloads new versions from there.
- **Phones over Wi-Fi** (when you open the phone link): the public [PeerJS](https://peerjs.com/) server introduces the phone to the computer, and Google's STUN servers help them find each other on the network. The picture and sound then go directly between your devices, encrypted. Every phone has to be allowed in on the computer.
- **IP cameras** you add: Cortiva connects to the address you type.
- **Bluetooth cameras** (GoPro, Sony) you pair: Cortiva talks to them over Bluetooth only.

The website version is served by GitHub Pages, which keeps its own access logs ([GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).

## License

Cortiva is free software under the [GNU General Public License v3.0 or later](LICENSE): you can use, study, share and change it; if you distribute a modified version, you must share its source under the same licence. It comes with no warranty.
