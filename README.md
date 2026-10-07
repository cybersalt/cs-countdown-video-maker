# CS Countdown Video Maker

A browser-based countdown/count-up timer that renders straight to a video file, with a **transparent background** if you want one. Drop the file onto a track above your footage in Vegas Pro, Camtasia, DaVinci Resolve or any other editor.

Built by [Cybersalt Consulting Ltd.](https://cybersalt.com)

---

## Quick start

1. Open `index.html` in **Google Chrome** or **Microsoft Edge** (double-clicking the file is fine, no server needed).
2. Set the time (hours / minutes / seconds), pick a theme, a position and colours.
3. Press **▶** to preview. Exactly what you see is what gets exported.
4. Choose a format under **Export** and click **Export**. Chrome asks where to save, then renders the file *faster than real time*: a 2-minute transparent countdown takes a few seconds.

## Features

- **12 themes:** Ring, Radio (7-segment LED), Stopwatch, Minimal, Flip clock, Scoreboard (dot-matrix), Pie, Progress bar, Neon, Badge, LED ring, Digital HUD
- **Count down or count up**, with hours. Formats: auto, `M:SS`, `MM:SS`, `H:MM:SS`, `HH:MM:SS`, seconds only
- **Position:** centre, any corner or edge (3×3 grid), with size and edge-margin sliders. Badge or Progress bar in the bottom-right corner makes a good overlay
- **Text:** optional label ("Starting soon", "Break", … or none for the time only), hold at the end for N seconds, optional end message ("Time's up", "Go!", …), optional flashing
- **Background:** transparent, black, green screen, blue screen, white or any colour
- **Colours per theme:** each theme shows its own named colour slots, e.g. Pie has *Wedge / Face / Rim / Tick marks / Numbers / Label* and Progress bar has *Bar fill / Bar track*. Border, track and label colours start on **AUTO** (the theme's own look) until you pick one, and × sets them back to auto. There's also a warning colour for the last N seconds, plus glow, drop shadow and smooth motion
- **Sound:** beeps for the last N seconds, a long beep at zero, ticks (every second or only the last N seconds) with a choice of tick sound (*Tick*, *Flip card*, *Soft click*; *Auto* uses the flip sound for the Flip clock), adjustable tone and volume, plus your own sound clip (play at the start, end exactly at zero, play at zero, or loop until zero)
- **Presets:** four starters, plus your own named presets saved in the browser (sound clip included). Export the current settings or all presets to a `.json` file and import them again on any computer
- Your last settings and sound clip are remembered between visits
- **How-to panel** at the bottom with step-by-step instructions for VEGAS Pro, Camtasia, DaVinci Resolve, Premiere Pro, OBS Studio and other editors

## Export formats

| Format | Transparent | Sound | Best for |
|---|---|---|---|
| **MOV · transparent** (PNG codec) | ✅ | ✅ PCM | Vegas Pro and Camtasia overlays |
| **MP4 · H.264** | ❌ (transparent becomes black) | ✅ AAC | Full-screen countdowns, small files |
| **PNG sequence** + `audio.wav` | ✅ | ✅ separate WAV | Fallback if an editor won't read the MOV |
| **WAV** | n/a | ✅ | The beeps or clip on their own |

All output is 1920×1080 at 30 fps. MP4 has a keyframe every second for smooth scrubbing.

### Using the files

The app's **Using the files in your editor** panel has step-by-step instructions for each editor. The short version:

- **VEGAS Pro:** drag the `.mov` onto a track above your footage. If the background shows as black, right-click the clip → *Properties → Media → Alpha channel* → **Straight (unmatted)**.
- **Camtasia:** import the `.mov` into the Media Bin and drag it onto a track above your footage. TechSmith lists MOV with the PNG codec as supported on Windows.
- **DaVinci Resolve:** put the `.mov` on V2 above your footage. If needed: *Clip Attributes → Video → Alpha Mode → Straight*.
- **PNG sequence:** import the first frame as an image sequence (Vegas: tick **Open still image sequence**), then add `audio.wav` on an audio track.

### File size

Transparent MOVs store each frame as a PNG, so they're bigger than MP4s. Two things keep them reasonable:

- **Compact MOV** (on by default): a countdown frame usually repeats 30 times before the number changes, so each distinct frame is stored once and the repeats point back to it. The file still plays as a normal constant 30 fps clip. If an editor ever shows glitches, untick it and export again.
- The export panel shows an **estimate** before you export. **Smooth motion** (continuous rings and bars) and the flip animation make many frames distinct, so leave smooth motion off for long transparent exports. It costs nothing in MP4.

## Browser support

Chrome or Edge on desktop. The app uses the File System Access API (saving large files straight to disk) and WebCodecs (H.264/AAC for MP4). Other browsers can preview, and they fall back to downloading the file from memory.

## Project layout

```
index.html            the app (open this)
css/app.css           styles
js/core.js            settings, time model, formatting, colour helpers
js/draw.js            drawing helpers: tabular digits, 7-segment, dot-matrix font
js/renderer.js        background, placement, drop shadow, frame keys for de-duplication
js/themes/*.js        themes (each one is a small object, so adding one is easy)
js/audio.js           beeps / ticks / sound clip for both preview and export
js/mux.js             tiny MP4 / QuickTime MOV writer (no dependencies)
js/export.js          PNG encoder and the four exporters
js/app.js             UI wiring and live preview
js/presets.js         presets (IndexedDB), .json export/import, remembered sound clip
```

There are no external JavaScript dependencies, so it works offline (the Google Fonts load when online, and the browser caches them).

### Hosting it as a single page

`node tools/build.mjs` bundles everything into one self-contained file, `dist/countdown.html`, which can be uploaded anywhere on its own. The hosted copy is at <https://cybersalt.com/countdown.html>. Rebuild and re-upload it after changes; `dist/` isn't committed.

### Adding a theme

Call `CDM.registerTheme({ id, name, font, box(m), draw(ctx, m) })` in a file under `js/themes/` and add a `<script>` tag for it. Draw centred on `(0, 0)` inside the box returned by `box()`. The renderer handles position, size, background and shadow. `m` holds the formatted text, progress, label, colours and so on (see `CDM.modelAt` in `core.js`).

## License

MIT. Free to use and modify. Credit appreciated but not required.
