# Contributing to Futatoki the clock

Thanks for your interest! All contributions are welcome, from fixing a typo to adding a new language.

## Quick reference

- 🌍 [Add a translation](#adding-a-translation)
- 🐛 [Report a bug](#reporting-bugs)
- 💡 [Suggest a feature](#suggesting-features)
- 🔧 [Submit code](#submitting-code)

## Adding a translation

Translations are the most impactful contribution you can make.

### Steps

1. Check `src/i18n/resources/` to see if your language already exists.
2. If not, copy `en.json` to `<your-language-code>.json` in the same folder.
   - Use [BCP 47](https://www.rfc-editor.org/info/bcp47) tags, matching the style of existing files:
     - Language only: `es` (Spanish), `fr` (French), `ko` (Korean)
     - Language + region when it matters: `pt-BR` (Brazilian Portuguese), `zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese)
   - `ja.json` is the source of truth. `en.json` is the easiest to translate from, but if you read Japanese, cross-referencing `ja.json` can help resolve nuance.
3. Translate all values. **Keep the keys unchanged** — only translate the right-hand side of each `"key": "value"` pair.
4. Register the locale in `src/i18n/locales.ts` by adding an entry to the `SUPPORTED_LOCALES` array:
   ```ts
   { code: "xx", name: "English name", endonym: "Native name", dir: "ltr" },
   ```
   - `code`: must match your JSON filename
   - `name`: language name in English
   - `endonym`: language name written in its own script (e.g. `日本語`, `العربية`)
   - `dir`: `"ltr"` for most languages, `"rtl"` for right-to-left scripts
5. Test locally:
   ```bash
   bun install
   bun dev
   ```
   Then open `http://localhost:5173/?lang=<your-language-code>` to force your locale, or change your browser language and reload.
6. Submit a PR.

### Translation guidelines

- Keep tone warm and friendly (this is for parents and children).
- Avoid jargon — use everyday words a 5-year-old's parent would use.
- For color names, use the most common everyday word, not technical terms (e.g. "red", not "crimson").
- If a word doesn't translate well, use the closest child-friendly equivalent rather than a literal translation.
- Preserve ICU MessageFormat placeholders like `{hour}` or `{count, plural, ...}` — translate the surrounding text, not the placeholder syntax.
- RTL languages (Arabic, Persian, Urdu): the app flips layout automatically via the `dir` field — just translate the text.

### RTL languages

If you're adding an RTL language, the only RTL-specific work is setting `dir: "rtl"` on the `SUPPORTED_LOCALES` entry (step 4 above). The app reads that field and sets `document.documentElement.dir` at load time, which flips the layout via CSS logical properties and browser-native RTL handling. No stylesheet changes are required.

If you notice a visual element that doesn't flip correctly (e.g. an icon that should mirror), please mention it in your PR — that's a layout bug to fix, not something the translator needs to work around.

## Reporting bugs

Open an issue with:
- What you expected
- What happened
- Steps to reproduce
- Browser / device / OS
- Screenshot if visual

## Suggesting features

Open an issue describing the idea. Before suggesting:
- Check existing issues to avoid duplicates.
- Consider whether it fits the "color-first, child-simple" philosophy (see below).
- Explain who it helps and how.

## Submitting code

1. Fork the repo.
2. Create a branch: `git checkout -b fix/your-fix`.
3. Make changes, commit with clear messages.
4. Build to check for type and bundler errors:
   ```bash
   bun run build
   ```
   (There is no automated test suite yet — a successful build + manual smoke-test in `bun dev` is the current bar.)
5. Open a PR.

### Code style

- Follow existing patterns — the codebase is small enough to read end-to-end.
- TypeScript + SolidJS conventions (signals, stores, `createResource` etc.).
- Keep components small and single-purpose.
- Don't add tracking, analytics, or external dependencies without discussion.

## Philosophy

Futatoki exists to help young children learn time. Keep in mind:

- **Simple is better.** If a feature adds complexity for an edge case, it might not belong.
- **No tracking, ever.** User privacy is non-negotiable.
- **No ads.** Ever.
- **Accessibility matters.** Color-blind, low-vision, and motor-impaired children all deserve to use this.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](./LICENSE)).
