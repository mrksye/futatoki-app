<img src="./branding/icon-192.png" alt="{Your Brand Name}" width="96" />

# {Your Brand Name}

A short tagline describing what your fork does.

🌐 [Try it live](https://{your-domain.example}/?lang=en)

## Why this fork?

Explain what your fork brings that the upstream Futatoki doesn't — different
target audience, additional features, region-specific localization, etc.

## Tech stack

(Inherited from upstream; adjust if you swap any of these out.)

* [SolidJS](https://www.solidjs.com/) + SVG
* [Vite](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
* [Tailwind CSS](https://tailwindcss.com/)
* [Cloudflare Workers](https://workers.cloudflare.com/) (or any static host)

## Getting started

### Prerequisites

* [Bun](https://bun.sh/) (project uses `bun.lock`; scripts run via `bun run`)

### Development

```sh
git clone https://github.com/{your-org}/{your-repo}.git
cd {your-repo}
bun install
bun dev
```

### Build

```sh
bun run build
```

## Brand customization

This project is fork-friendly by design. To rebrand:

1. Edit `branding/brand.config.ts` — set your `domain`, `lpDomain`,
   `storagePrefix`, `logPrefix`, `defaultTitle`, `themeColor`,
   `backgroundColor`, and `externalLinks.privacy`.
2. Edit `src/i18n/brand.ts` — set your 5-axis brand names (CHARACTER /
   OFFICIAL / LP / APP / APPLE) for every locale you support. Locales you
   drop should also be removed from `src/i18n/locales.ts`.
3. (Optional) Edit `src/i18n/resources/{locale}.json` — `meta.title` and
   `meta.description` use `{characterBrand}` / `{officialBrand}` / `{lpBrand}` /
   `{appBrand}` / `{appDomain}` / `{lpDomain}` placeholders that expand at
   runtime and at build time.
4. Replace the visual assets in `branding/`:
   - `branding/icon.svg`, `branding/icon-192.png`, `branding/icon-512.png` (PWA)
   - `branding/og.png` (Open Graph share image, 1180×820 recommended)
   - `branding/screenshot.webp` (README image)
5. Replace the root `NOTICE` and `README.md` from `branding/NOTICE.example.md`
   and `branding/README.example.md` (this file).
6. Run `bun run build` — every PWA manifest (one per locale), `robots.txt`,
   `sitemap.xml`, and the `index.html` / per-locale HTMLs are regenerated
   with your brand values.

## License

MIT — see [LICENSE](./LICENSE)

The names and visual assets reserved under separate IP are listed in
[NOTICE](./NOTICE).

## Credits

This project is a fork of [Futatoki](https://github.com/mrksye/futatoki-app)
by [Mrksye](https://github.com/mrksye). The MIT-licensed source code remains
under its original copyright; only the brand identity has been swapped per
the customization process above.
