# Futatoki the clock

A free, open-source educational analog clock web app for children aged 1-7, where each hour is represented by a distinct color.

<!-- TODO: add docs/screenshot-hero.png and uncomment
[![Futatoki the clock screenshot](docs/screenshot-hero.png)](https://futatoki.app/)
-->

🌐 [Try it live](https://play.futatoki.app/) · 📖 [Learn more](https://futatoki.app/) · 📚 [Usage guide](https://futatoki.app/guide)

## Why another clock app?

Most analog clocks overwhelm young children with two overlapping abstractions: reading numbers *and* interpreting hand positions. Futatoki reverses the order — children learn time **through color first**, then numbers come later.

- Each hour is a distinct color in a 12-segment ring
- AM and PM shown as two parallel faces (no "3 o'clock happens twice" confusion)
- Six color palettes, including a colorblind-friendly option
- "Clean" mode for young children, "Detailed" mode for number practice
- Free rotation mode that can't go backward — because time doesn't

## Features

- ⏰ **Color-coded hour rings** - 12 distinct colors, one per hour
- 🌓 **AM/PM parallel display** - both halves of the day, side by side
- 🎨 **6 color palettes** - vivid, sky, blue-green, primary, color wheel, colorblind-friendly
- 🔄 **Free rotation mode** - drag the hands to any time
- 🎲 **Random mode** - 15-minute interval quizzes
- ☀️ **Auto rotation** - 24 hours in 24 seconds, with sky color transitions
- 📱 **PWA** - install on phone/tablet, works offline
- 🌍 **20 languages** supported
- 🔒 **No ads, no user tracking, no accounts** - app is 100% client-side

## Tech stack

- [SolidJS](https://www.solidjs.com/) + SVG
- [Vite](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for offline support
- [Tailwind CSS](https://tailwindcss.com/)
- [Cloudflare Workers](https://workers.cloudflare.com/) (hosting)
- No backend, no database, no user accounts

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (project uses `bun.lock`; scripts are run via `bun run`)

### Development

```bash
git clone https://github.com/mrksye/futatoki-app.git
cd futatoki-app
bun install
bun dev
```

### Build

```bash
bun run build
```

### Deploy (Cloudflare Workers)

```bash
bun run deploy
```

This runs `vite build` followed by `wrangler deploy`. Requires a Cloudflare account and `wrangler login`.

## Contributing

Contributions welcome — especially translations.

### Adding a translation

Translations live in `src/i18n/resources/` as JSON files (one per language). `ja.json` is the source of truth — other locales are kept in sync with it. To add a new language, copy any existing locale file to `<your-language-code>.json`, translate the values, and open a PR.

## License

MIT — see [LICENSE](./LICENSE)

The name "Futatoki" / "Futatoki the clock" and the project's branding are not covered by the MIT License — see [NOTICE](./NOTICE) for details.

## About

Built by [Mrksye](https://github.com/mrksye), a freelance developer based in Japan.

First released: 2026-04-21
