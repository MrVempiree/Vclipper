# Vclipper

A local-first, browser-based video clipper and editor. Open a video, trim
it, tune speed and colour, burn in a caption, let the built-in energy
analysis suggest highlight windows, and export a WebM clip — all inside
one browser tab. Your file is never uploaded anywhere.

## Two workflows

**Local mode (default)** — no account, no key, no network calls:

- Trim with start/end sliders and a live audio waveform
- AI highlight suggestions from per-second audio-energy peaks
- Speed, brightness, contrast, saturation and volume controls
- Aspect/crop presets (9:16, 16:9, 1:1, 4:5), rotate and flip
- Filter presets: Vivid, Mono, Warm, Cool, Vintage
- Caption burn-in, mute, fade in/out, loop preview
- Frame capture as PNG
- One-click WebM export via Canvas + MediaRecorder
- Ten pet assistants (Gravion, Vempire, Mochi, Captain Whiskers,
  Professor Hoot, Nova, Rasgulla, Jalebi, Panda, Biscuit): type a command
  like "clip 10 se 25 second" or "rotate karo" and the pet performs the edit

**API-key mode (bring your own key)** — for users who want model help:

- Paste any OpenAI-compatible endpoint + your own API key
- AI naming for detected highlight windows
- Video generation through a video endpoint you configure
- The key is stored only in your browser's localStorage and is sent only
  to the endpoints you set

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

## Tests

```bash
node --test
```

## License

MIT
