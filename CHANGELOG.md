# Changelog

Every version is its own release on GitHub. Each version's section below is what its release notes say.

## 0.12.0-beta — 26 Nov 2026

### New: a presentation page
- **eric-2812.github.io/cortiva** now opens a page that explains Cortiva: what a take gives you, the cameras it works with, keyboard control and privacy, with **Download for Windows** and **Open in the browser**.
- Its animations show the app at work: a recording with its timecode and audio meters running, a take's files appearing one by one, the shutter and ISO changing from the keyboard, a phone asking to join. They pause when off screen, can be paused by hand, and stay still if your system asks for reduced motion.
- No photographs and no outside requests: everything is drawn in the page.

### Changed
- **The web app moved to eric-2812.github.io/cortiva/app/.** Old links and QR codes (with `?join=`) still work: they go straight to the app.
- The desktop app opens the app as before, and new phone QR codes point to the new address.

## 0.11.0-beta — 26 Nov 2026

### Choose where recordings go
- **The header now always shows where recordings are saved**, next to the take number (for example "Downloads" or your folder's name). One click opens the picker to choose another folder; each take goes into its own subfolder inside it.
- It's remembered the next time you open Cortiva (the browser asks for permission again at the first take).
- In the desktop app, with no folder chosen, it says that recordings go to **Videos\Cortiva**.
- Choosing a folder needs Chrome, Edge or the desktop app. Other browsers download the files instead.

### The 4K files from camera cards, inside the take
- In **Takes**, every take has **"Add files from camera cards (4K)"**. Pick the files the cameras recorded on their own cards (GoPro, Sony, Canon, the phone…) and say which camera each one came from.
- They're copied into the take's folder with the same naming as the other files (for example `Wedding_T003_C2_Sony_CARD.mp4`), so your editor sees them together. With no folder chosen, they're saved as downloads.
- A `…_cards.json` file lists each one's original name, duration and camera clock time. Line them up with the slate or by audio waveform.
- Takes are remembered when you close Cortiva, so you can add the card files later.

### Better 4K quality
- Each camera records at a quality that matches its resolution: a 4K camera gets four times the data of a 1080p one, so its file keeps the detail. The storage-per-hour estimate in Setup → Recording takes it into account.

## 0.10.0-beta — 26 Nov 2026

### New: the app updates itself
- The installed app checks for new versions when it opens and every 4 hours, and downloads them in the background. When one is ready you'll see **"Cortiva x is ready"**, with **Restart to update** and a **What's new** link. If you don't restart, it installs when you close Cortiva.
- It won't restart while you're recording.
- The portable version can't update itself: it tells you a new version is out and links to the download.
- **Install this version by hand once.** Earlier versions don't have the updater; from 0.10 on, new versions arrive by themselves.

### New: remembers your setup
- When you open Cortiva, **"Pick up where you left off"** shows last time's cameras and microphones. **Restore last setup** reconnects them with their names, numbers, settings (zoom, focus, exposure, colour…), whether they were armed, and each mic's level, processing and audio-follows-video.
- Always remembered: the project name, the next take number (so file names don't repeat), recording settings, frame rate, title, transition and recording folder (the browser asks for permission again at the first take).
- IP cameras are remembered without their password. Phones, screen sharing and Bluetooth cameras have to be connected again, because the browser requires you to do it yourself.
- If you start fresh instead of restoring, the saved setup isn't erased until you connect something new.
- Everything is saved on this computer only.

## 0.9.0-beta — 26 Nov 2026

### Cortiva is free software
- Cortiva is licensed under the **GPL v3**: anyone can use, study and change it, and anyone who distributes a modified version must publish its source under the same licence. The installer shows the licence, and **Setup** links to the licence, the source code and the privacy notes.
- The README now has **privacy notes**.

### Privacy
- **The app no longer connects to Google when it starts.** The fonts (Inter and IBM Plex Mono) ship inside the app instead of loading from Google Fonts, and the desktop app looks the same offline.
- Cortiva only connects elsewhere when you ask it to: joining a phone over Wi-Fi, adding an IP camera or pairing a Bluetooth camera.

## 0.8.0-beta — 26 Nov 2026

### New: approve every phone
- **No phone gets in without your permission.** When a phone asks to join over Wi-Fi, a notice appears at the top right: **"Phone X wants to join"**, with **Allow** and **Deny**. Its camera and mic aren't added until you press Allow, even if it has the link or the QR code.
- While it waits, the phone shows "Waiting for the computer to allow this phone". If you deny it, the phone says so and stops trying.
- A phone you've allowed reconnects by itself if the Wi-Fi drops, without asking again (as long as it doesn't reload the page).
- With no answer in 90 seconds it's turned away. At most 4 requests show at once, so nobody can flood the screen.

## 0.7.0-beta — 26 Nov 2026

### Fixes
- **REC pressed several times in a row.** Pressing REC (or R) two or three times quickly made a take of almost zero seconds and left the button the wrong way round: it looked like it was recording when it wasn't. A second press within half a second is now ignored.
- **REC while the previous take is still saving.** It used to do nothing without saying why. It now says the previous take is still being saved (or that recording is starting).
- **Cameras with an unusual shutter or iris range.** If a camera reported a shutter or iris range that included none of the listed speeds or f-numbers, the settings panel could stop working. That control is now simply hidden, and its shortcut says the camera doesn't have it.

### Checked, no problems found
- Several takes with several cameras and mics (7 files per take), markers, slate, cuts, transitions, fade to black and titles.
- A camera can't be removed while recording.
- Changing resolution, removing cameras, phones over Wi-Fi (malformed data included), keyboard shortcuts, camera reconnection, iPad and the Canon · Nikon · Fuji · Lumix tab.
- Every page on phone, tablet and computer, with nothing spilling off the screen and no errors.

## 0.6.0-beta — 25 Nov 2026

### New: Canon, Nikon, Fujifilm and Lumix
- New **Canon · Nikon · Fuji · Lumix** tab (also on the welcome screen). Pick the brand and it shows step by step how to connect your camera:
  - **Canon:** recent EOS models (R8, R5 Mark II…) work as a USB webcam with no software. Others use **EOS Webcam Utility**.
  - **Nikon:** Z6III (firmware 2.0 or later), Z f and Z50II use **USB streaming (UVC/UAC)** from the network menu. Others use **Nikon Webcam Utility**.
  - **Fujifilm:** newer models use the **USB WEBCAM** connection mode. Older ones (X-T4, X-S10, X-Pro3, X100V…) use **FUJIFILM X Webcam**.
  - **Lumix:** newer models use the **PC (Webcam)** USB mode. Older ones (S1, S5, GH5, G9…) use **LUMIX Webcam Software**.
  - For all of them: clean HDMI into a capture card for the best quality and lowest delay.
- Cortiva **recognises these cameras by name** when they're connected and adds them in one click, with their microphone if they have one.
- The latency estimate accounts for how the camera is connected: the maker's app, the camera's own USB mode or HDMI. As soon as the browser can measure it, the measured value is used.
- Tips for long shoots: mains power, auto power-off disabled and a clean HDMI output.
- The welcome screen also offers **Share a screen or window**.

### Known limits
- In USB webcam mode almost no camera lets the computer change focus, ISO or shutter. If the camera offers them, they show in the panel; otherwise set them on the camera.
- Not yet tested with real Canon, Nikon, Fujifilm or Lumix cameras.

## 0.5.0-beta — 25 Nov 2026

### iPad and iPhone
- **The iPad's camera no longer "gets lost" without explanation.** iPad and iPhone can use only one of their cameras at a time in the browser: adding another stops the first. Cortiva now warns you first, explains why it stopped and has a **Switch back** button.
- Fixed a 0.4 bug on iPad: two cameras of the same iPad could keep taking the signal from each other.
- Camera pictures are kept inside the page so Safari doesn't pause them.
- For more angles with an iPad, join other phones over Wi-Fi (iPhone or Android / Wi-Fi tab).

### Website
- **The website is now updated with every release**, with exactly the same version as the `.exe` files. It used to change with every commit, even without a release.
- The status bar shows the version (for example **v0.5.0-beta**), on the web and in the app.

## 0.4.0-beta — 25 Nov 2026

### Fixes
- **A USB camera that loses its signal now reconnects by itself.** It used to say "waiting for the device to come back" but never tried. It now retries at once and then every few seconds, and when it's back it gets its settings again (focus, shutter, white balance…).
- If the camera is busy in another app (another tab, the Cortiva app, Teams, the Camera app…), it tells you. On Windows most cameras can be used by only one app at a time.
- The camera panel has a **Try now** button to retry by hand.
- The QR code for joining phones from the desktop app points at the website's new address (**eric-2812.github.io/cortiva**) after the repository was renamed.

### Known limits
- If a camera drops out during a take, its file for that take ends there; the next take records normally.

## 0.3.0-beta — 25 Nov 2026

### New: configurable keyboard shortcuts
- In **Setup → Shortcuts** you can change the key for every action: click the key, press the new one, done. **Esc** cancels, **Backspace** removes it, and **Reset to defaults** brings back the original keys. They're saved on the computer.
- New keys for the selected camera (the one open in the settings panel):
  - **C** / **Shift + C**: shutter faster / slower, one stop at a time (1/50 → 1/60 → 1/100…).
  - **I** / **Shift + I**: ISO up / down.
  - **E** / **Shift + E**: exposure ± ⅓ stop.
  - **A** / **Shift + A**: iris (higher / lower f-number).
  - **N** / **Shift + N**: ND filter.
  - **D** / **Shift + D**: focus farther / nearer.
  - **Z** / **Shift + Z**: zoom.
  - **W** / **Shift + W**: white balance ± 100 K.
  - **.** and **,**: next / previous camera.
  - No default key, assign them as you like: auto exposure, autofocus, auto white balance, pan / tilt and torch.
- Holding a key keeps the setting changing.
- Each key press shows the new value at the top, for example **"Cam 1 — Shutter 1/100 · 180°"**.
- As in the panel, only the camera's own controls work. If it doesn't have one, the notice says so ("Cam 2 has no shutter control").
- Changing shutter or ISO from the keyboard switches the camera to manual exposure. Focus switches to manual focus, and white balance to manual white balance.
- The usual keys (R, M, S, Space, Enter…) can be changed too. **1–9** and **Shift + 1–9** stay fixed for selecting and cutting cameras.

## 0.2.0-beta — 24 Nov 2026

A security release, after an audit of the whole app.

### Security
- **Electron 45** (was 33, which no longer received Chromium security fixes).
- The desktop app only shows its own pages: it doesn't navigate to outside websites or open new windows, and external links (`https` only) open in your browser.
- Camera, microphone, Bluetooth, folders and screen access are granted only to the app itself. USB, serial and HID devices are no longer accessible.
- The executable is hardened: it can't be used as a Node interpreter or have code injected through environment variables or debuggers, and it checks that its files haven't been modified.
- A Content Security Policy in the app and on the web: only Cortiva's own code runs.
- Pairing a Bluetooth camera always asks for confirmation.
- Downloaded files always go inside **Videos\Cortiva**, with clean names.

### Phones over Wi-Fi
- The room code is longer (10 characters) and comes from the system's secure random generator, so it can't be guessed.
- Everything a phone sends is checked before use: names without odd characters, valid camera settings. A phone sending malformed data can no longer break the control room.
- At most 16 phones connected at once.

### Recordings
- If an IP camera's address contains a password, it's no longer shown on screen or saved in the take sheet.
- The markers CSV no longer lets a spreadsheet read a name as a formula, and the EDL doesn't break on odd names.

### Project
- The GitHub workflows use pinned versions of each action, and Dependabot checks weekly for security updates.

### Known limits
- The installer still isn't code-signed: Windows will say "unknown publisher" the first time.

## 0.1.0-beta — 24 Nov 2026

The first Cortiva beta for Windows.

### What's in it
- Records every camera and every microphone to its own file, all starting on the same frame, plus the switched program, an EDL, markers and a take sheet.
- Webcams and capture cards, iPhone (Continuity Camera or Wi-Fi), GoPro (webcam mode or HDMI), Sony Alpha (USB streaming or HDMI), IP cameras and screen sharing.
- GoPro (HERO9+) and Sony Alpha cameras paired over Bluetooth record to their own cards when you press REC.
- The camera settings the hardware supports (focus, shutter, ISO, white balance, PTZ and more) and, per microphone, trim, EQ, compressor and noise gate.
- Master timecode, lip-sync alignment, slate, focus view with zebra / peaking / histogram, and a live video switcher.
- Recording needs at least one camera; microphones have their own tab and appear on the welcome screen.
- Recordings with no folder chosen go to **Videos\Cortiva**.

### Known limits
- Not yet tested with a real Sony a7 IV or GoPro over Bluetooth.
- Phones join through the web version (the QR code opens it), so the website must be published on GitHub Pages.
