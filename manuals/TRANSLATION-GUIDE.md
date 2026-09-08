# Translation guidance

## Goals

The documentation system separates four concerns:

1. stable LaTeX structure (`*.tex` wrappers + `moda-manual.sty`)
2. localized prose (`content/<locale>/...`)
3. localized screenshots (`<screenshot-id>.<locale>.png` beside the main `.tex` files)
4. application identifiers/statuses that must not be accidentally translated in technical procedures

## Translator rules

- Translate headings, explanations, warnings, captions and user-facing labels.
- Keep LaTeX control sequences unchanged.
- Keep screenshot IDs unchanged.
- Preserve current technical enum values when they are shown as system values, e.g. `ACTIVE`, `SUSPENDED`, `FREE`, `PAID_METERED`, `SUPER_ADMIN`.
- Keep locale codes unchanged.
- If the localized UI uses a translated label, translate the prose/UI label in the manual to match the screenshot.
- Do not reuse an English screenshot in a non-English manual merely because the localized screenshot is not ready; leave the generated placeholder until the correct image exists.

## Translation QA

For every language release, check:

- no English screenshot appears unintentionally;
- navigation/button names match the actual localized UI;
- date, time, number and currency examples read naturally in the locale;
- long translated headings do not overflow tables or page margins;
- CJK/Thai glyphs render correctly with the build fonts;
- screenshots do not expose real customer personal data;
- all screenshot placeholders have been intentionally accepted or replaced.
