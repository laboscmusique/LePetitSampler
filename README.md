# LePetitSampler

**LePetitSampler** is a browser-based sampler built entirely with vanilla JavaScript and the Web Audio API. Its goal is educational: to demonstrate, in a simple and hands-on way, the fundamental features of a sampler — how to load audio, shape its envelope, filter it, pitch it, and sequence it into rhythms.

No frameworks, no dependencies beyond a build step. Just the web platform, a keyboard, and curiosity.

## Features

- **Chromatic Edition** — load a sample tuned in C3 and play it chromatically across two octaves, with real-time pitch shifting
- **Drum Edition** — 8 drum pads, each with its own sample, pitch, volume, ADSR envelope, and sample start point
- **Step Sequencer** — a 32-step grid (2 bars at 1/16th note resolution) with play/stop, BPM control, and WAV export of 4 measures
- **ADSR Envelope** — visual graph with attack, decay, sustain, and release parameters
- **Waveform Editor** — drag to set sample start, loop in and loop out points directly on the waveform
- **Filter Module** — low-pass or high-pass filter with frequency and resonance controls and a live response curve
- **Computer Keyboard** — play notes and trigger pads from your keyboard (QWERTY / AZERTY / QWERTZ layouts)
- **Performance Recording** — capture your playing session and export as WAV
- **6 Languages** — French, English, German, Spanish, Italian, Portuguese

## Getting Started

```bash
npm install
npm run dev      # build + watch + serve on localhost
npm run build    # bundle to app.js
```

Then open `index.html` in a browser. That's it.

## How It Works

Everything runs in the browser. The Web Audio API handles sample playback, pitch shifting, filtering, and the ADSR envelope. The step sequencer uses a look-ahead scheduler for tight timing, and offline rendering for bounce-to-WAV export. The UI is plain HTML, CSS, and JavaScript — no virtual DOM, no build toolchain beyond esbuild.

## License

MIT
