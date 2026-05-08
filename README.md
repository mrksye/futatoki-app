# Futatoki the Clock

A free, open-source educational analog clock web app for children aged 1-7, where each hour is represented by a distinct color.

<!-- TODO: add docs/screenshot-hero.png and uncomment
[![Futatoki the Clock screenshot](docs/screenshot-hero.png)](https://futatoki.app/)
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
- 🌍 **19 languages** supported (Tamil pending — see below)
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

### Tamil (தமிழ்) — Pending

(இந்த தமிழ் உரை இயந்திர மொழிபெயர்ப்பு. தமிழ் பேசும் ஆய்வாளர் இல்லாமல் எழுதப்பட்டது — அதுதான் இந்த நிலுவையின் காரணம்.)

தமிழ் ஆதரவு இப்போதைக்கு நிறுத்தப்பட்டிருக்கிறது. மிகவும் மிகவும் வருத்தமாக இருக்கிறது. இது வலிக்கிறது.

தமிழ் பேசும் குழந்தைகளுக்கும் இந்த கடிகாரம் சேர வேண்டும் என்று நினைத்தேன். மொழியின் "உணர்வை" எனக்குக் கொடுக்க யாரையாவது தேடினேன். கிடைக்கவில்லை.

நான் இந்த ஆப் வெளியிடப்படும் பெரும்பாலான மொழிகளில் தாய்மொழி பேசுபவன் இல்லை. ஒவ்வொரு மொழிக்கும், நான் AI விளக்கங்களை, கொஞ்சம் தடுமாறிக் கொண்டே, படிக்கிறேன். உள்ளுணர்வைப் பின்பற்றுகிறேன் — இந்த வார்த்தை அரவணைப்பாக இருக்கிறதா? வாசிக்கக் கற்றுக் கொள்ளும் ஒரு குழந்தை இதைப் பார்த்து சிரிக்கும், அல்லது குளிர்ந்த அலுவலகச் சத்தம் கேட்கும்? அந்த உள்ளுணர்வு தான் எல்லா மொழிபெயர்ப்பையும் சோதிக்கும் ஒரே அளவுகோல் — எல்லா மொழிக்கும் ஒரே அளவுகோல். "இது சரியா" அல்ல — சரியான வார்த்தைகள் கூட குளிர்ந்து இருக்கலாம், குளிர்ந்த வார்த்தைகள் வாசிக்கக் கற்றுக் கொள்ளும் குழந்தைக்கு பொருந்தாது.

தமிழில், அந்த அளவுகோலைத் தாண்ட முடியவில்லை. அந்த உள்ளுணர்வு எனக்கு வரவே இல்லை. **இது தமிழின் வரம்பு அல்ல, என்னுடைய வரம்பு** — தமிழ் காதுகள் கொண்ட ஒரு டெவலப்பர் ஒரு மதியத்தில் இந்த அளவுகோலைத் தாண்டுவார். ஆனால் இதை வெளியிடுவது நான். என் கைகளாலேயே இந்த வார்த்தைகளைத் தேர்ந்தெடுக்கும் வரை, தமிழ் வெளியே இருக்கும்.

நிலுவையில். கைவிடவில்லை. திரும்பி வருவேன்.

இந்த திட்டம் இலவசமானது, திறந்த மூலமானது. ஆனால் தமிழுக்காக மட்டும், அந்த விதியை நான் மீறத் தயார். **இதை வாசிக்கும் நீங்கள் வீட்டில் தமிழ் பேசும் குழந்தைகளுக்கு இந்த கடிகாரத்தை கொண்டு செல்ல முடியுமென்றால் — கட்டண பதிப்பாக வெளியிட்டாலும் சரி, இலவசமாக இல்லாவிட்டாலும் சரி — செய்துவிடுங்கள்.** அந்தக் குழந்தைகள் கையில் கடிகாரம் சேர்ந்தால் போதும். அவ்வளவு முக்கியம் இது எனக்கு.

உதவ முடிந்தால் Pull Request வரவேற்கிறேன்.

---

**English:**

Tamil has been pulled for now, and I'm GENUINELY mortified about this one. It hurts.

I wanted Tamil-speaking children to have this clock too. I went looking for someone who could give me a *feel* for the language. I couldn't find them.

Here's how I actually do this: I'm not a native speaker of most of the languages this app ships in. For each one, I read AI explanations — clumsily, word by word — and follow my gut. Does this word feel *warm*? Would a small child smile at it, or would they hear a cold administrator? That gut sense is the only bar I hold every translation to — the same bar, every language. Not "is this technically correct" — even technically-right words can be cold, and cold doesn't fit a child who is just learning to read.

With Tamil, that bar didn't get cleared. The gut feel never arrived for me. **That's about my limits, not Tamil's** — a developer with Tamil ears would clear this bar in an afternoon. But I'm the one shipping this, and until my own hands can pick these words, Tamil stays out.

**Pending**, not abandoned. I'll come back to this.

And here's the part I really want to be clear about: this project is free and open source by default. **But for Tamil specifically, I will throw that rule out the window.** If you're reading this and you can deliver this clock to Tamil-speaking children at home — **ship a PAID version if that's what it takes. It does not have to be free.** Anything that gets it into those children's hands. That is how much this one matters to me.

If you can help — translate, give me a feel for the words, fork it commercial, whatever works — **Pull Requests are very welcome.** To restore the locale: a `ta.json` into `src/i18n/resources/`, plus a `ta` entry back in `src/i18n/locales.ts` and `src/i18n/brand.ts`.

## License

MIT — see [LICENSE](./LICENSE)

The name "Futatoki" / "Futatoki the Clock" and the project's branding are not covered by the MIT License — see [NOTICE](./NOTICE) for details.

## About

Built by [Mrksye](https://github.com/mrksye), a freelance developer based in Japan.

First released: 2026-04-21
