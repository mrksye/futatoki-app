# Futatoki the clock

A free, open-source educational analog clock web app for children aged 1-7, where each hour is represented by a distinct color.

🌐 [Try it live](https://play.futatoki.app/) · 📖 [Learn more](https://futatoki.app/) · 📚 [Usage guide](https://futatoki.app/guide)

## Why another clock app?

Most analog clocks overwhelm young children with two overlapping abstractions: reading numbers *and* interpreting hand positions. Futatoki reverses the order — children learn time **through color first**, then numbers come later.

* Each hour is a distinct color in a 12-segment ring
* AM and PM shown as two parallel faces (no "3 o'clock happens twice" confusion)
* Six color palettes, including a colorblind-friendly option
* "Clean" mode for young children, "Detailed" mode for number practice
* Free rotation mode that can't go backward — because time doesn't

## Features

* ⏰ **Color-coded hour rings** - 12 distinct colors, one per hour
* 🌓 **AM/PM parallel display** - both halves of the day, side by side
* 🎨 **6 color palettes** - vivid, sky, blue-green, primary, color wheel, colorblind-friendly
* 🔄 **Free rotation mode** - drag the hands to any time
* 🎲 **Random mode** - 15-minute interval quizzes
* ☀️ **Auto rotation** - 24 hours in 24 seconds, with sky color transitions
* 📱 **PWA** - install on phone/tablet, works offline
* 🌍 **Multilingual** - 20 languages — see [CONTRIBUTING.md](./CONTRIBUTING.md) for maintenance status
* 🔒 **No ads, no user tracking, no accounts** - app is 100% client-side

> 💡 **Force a language via URL:** Append `?lang=<code>` to the URL — for example, [`play.futatoki.app/?lang=ja`](https://play.futatoki.app/?lang=ja) for Japanese, or `?lang=zh-TW` for Traditional Chinese.

## Tech stack

* [SolidJS](https://www.solidjs.com/) + SVG
* [Vite](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for offline support
* [Tailwind CSS](https://tailwindcss.com/)
* [Cloudflare Workers](https://workers.cloudflare.com/) (hosting)
* No backend, no database, no user accounts

## Getting started

### Prerequisites

* [Bun](https://bun.sh/) (project uses `bun.lock`; scripts are run via `bun run`)

### Development

```sh
git clone https://github.com/mrksye/futatoki-app.git
cd futatoki-app
bun install
bun dev
```

### Build

```sh
bun run build
```

### Deploy (Cloudflare Workers)

```sh
bun run deploy
```

This runs `vite build` followed by `wrangler deploy`. Requires a Cloudflare account and `wrangler login`.

## Contributing

Contributions welcome — especially translations. See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Officially maintained languages and how community translations work
- How to add a new language
- Code, bug reports, and feature suggestions

## License

MIT — see [LICENSE](./LICENSE).

The name "Futatoki" / "Futatoki the Clock" and the project's branding are not covered by the MIT License — see [NOTICE](./NOTICE) for details.

## About

Built by [Mrksye](https://github.com/mrksye), a freelance developer based in Japan.

First released: 2026-04-21
