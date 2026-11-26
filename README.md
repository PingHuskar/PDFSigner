# PDF Signer

A browser-only React app for filling and signing PDF templates in bulk. Nothing is uploaded to a server.

## Features

- **PDF template** – upload any PDF; pages render with pdf.js.
- **Variables** – declare text or image variables, then drag them onto the page.
  Text boxes can mix static text and placeholders, e.g. `Dear {{full_name}}, ref #{{#}}`.
- **Records** – one row per output document. Edit inline or import/export CSV
  (the CSV header row creates variables automatically).
- **Logos & signatures** – upload PNG/JPEG/other images (optionally strip a white background)
  or draw a signature. Place an image as-is on every record, or use an *image variable*
  to pick a different signature per record.
- **Fonts** – the built-in font is Helvetica (Latin only). Upload a `.ttf`/`.otf` for Thai or other scripts.
- **Output** – one merged PDF, or a ZIP with one PDF per record using a file-name pattern like `{{#}}-{{full_name}}`.
- **Projects** – save/open everything (template, layout, images, records, font) as a `.pdfsigner.json` file.

## Run

```bash
npm install
npm run dev
```

## Notes / limitations

- Text is drawn as plain text without complex shaping: most Thai fonts (e.g. TH Sarabun New) look right,
  but some fonts may place stacked marks slightly off.
- Pages with a non-zero `/Rotate` may place boxes incorrectly.
- Boxes are single-size: long text isn't auto-shrunk or wrapped (use `\n` / multiple lines in the content).
