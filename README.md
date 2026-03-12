# CS Countdown Video Maker

A browser-based countdown timer that exports directly to **MP4** — no screen recording needed. Drop the resulting file straight into Vegas Studio, Camtasia, DaVinci Resolve, or any other video editor.

Built by [Cybersalt Consulting Ltd.](https://cybersalt.com)

---

## Features

- **Four display themes**
  - **Ring** — circular progress arc with tick marks and glow
  - **Radio** — authentic 7-segment LED clock radio display
  - **Watch** — analog stopwatch face with smooth sweep hand and digital inset
  - **Minimal** — clean, typographic numbers-only layout

- **Fully customizable colors**
  - Accent color (arc, LED digits, sweep track, bars)
  - Number/text color
  - Background color (independent of preset swatches)

- **Three background presets**
  - Black
  - Green screen (chroma key)
  - White

- **Direct MP4 export**
  - Uses the browser's native WebCodecs API — no plugins or extensions required
  - Outputs H.264 MP4 at **1920×1080 / 30fps**
  - Compatible with Vegas Studio 22, Camtasia, DaVinci Resolve, Premiere, and more
  - Progress bar shows encoding status; file downloads automatically when done

- **Keyboard shortcuts**
  - `Space` or `K` — start / pause
  - `R` — reset

---

## Usage

1. Open `index.html` in **Google Chrome** (Chrome 94+ required for MP4 export)
2. Choose a **theme** and set your **countdown time**
3. Adjust **colors** as needed
4. To preview: hit **START**
5. To export a video file: click **⬇ Export .MP4**, confirm, and wait for the download

> **Note:** MP4 export encodes in real-time. An 8-minute countdown takes ~8 minutes to export. Leave the tab open and active while it runs.

---

## Browser Compatibility

| Feature | Chrome 94+ | Firefox | Safari | Edge |
|---|---|---|---|---|
| Live preview | ✅ | ✅ | ✅ | ✅ |
| MP4 export | ✅ | ❌ | ❌ | ✅ |

MP4 export requires the **WebCodecs API** (`VideoEncoder`), which is currently supported in Chrome and Chromium-based Edge. Firefox and Safari do not yet support it.

---

## Repo Structure

```
cs-countdown-video-maker/
├── index.html        # The full app — open this in Chrome
└── README.md
```

---

## Roadmap / Ideas

- [ ] Add more themes (flip clock, digital sports scoreboard, circular pie)
- [ ] Option to export with transparent background (alpha channel)
- [ ] Count-up mode
- [ ] Custom font upload
- [ ] Audio tick / beep on final 10 seconds
- [ ] Faster-than-realtime export

---

## License

MIT — free to use and modify. Credit appreciated but not required.

---

*Made with ❤️ and a lot of canvas drawing by Cybersalt Consulting*
