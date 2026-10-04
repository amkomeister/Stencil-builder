# Stencil Builder

Stencil Builder is a private-by-design, browser-based tool for turning a photo into three, four or five hand-cut stencil layers. It runs entirely on your device and exports individual black-and-white PNG or SVG cut files, plus a combined color preview.

## Privacy first

- Image processing happens locally in your browser.
- The app has no accounts, analytics, tracking, API calls or network requests.
- Uploaded images are kept in browser memory only and are not restored after the page is closed.
- Files are created only when you explicitly export them.
- No personal photographs or user-generated artwork are included in this repository.

See [PRIVACY.md](PRIVACY.md) for the complete privacy note.

## Features

- JPG, PNG and WebP input
- Crop movement, zoom and 90-degree rotation
- Color-sampled background removal with adjustable tolerance
- Portrait and classic stencil processing profiles
- Three, four or five deterministic tone layers
- Controls for contrast, detail, facial edges, shadow depth, minimum detail and bridge width
- Cleanup of small fragments, detection of floating material islands and automatic physical bridges
- Separate colors for every paint layer and a combined preview
- Matching registration marks on every cut file
- A5 (half of A4), A4, A3, A2, A1, A0, portrait, landscape and custom millimetre dimensions
- Individual black-and-white PNG and SVG exports
- Combined color PNG and named-layer SVG exports
- Mouse, keyboard and touch support

## Use the ready-made app

1. Download [`dist/StencilBuilder.html`](dist/StencilBuilder.html).
2. Double-click the file to open it in a modern browser.
3. Load a photo and adjust the composition and stencil settings.
4. Export each layer.
5. On each individual cut file, cut out the black areas and spray through those openings. Use the registration marks to align every layer and paint from light to dark.

The HTML file is self-contained and works offline.

## Paper formats and printing

Choose a format under **Page and size**. All presets support portrait and landscape:

| Format | Portrait dimensions | Size compared with A4 |
| --- | --- | --- |
| A5 | 148 × 210 mm | Half |
| A4 | 210 × 297 mm | Standard |
| A3 | 297 × 420 mm | Twice as large |
| A2 | 420 × 594 mm | Four times as large |
| A1 | 594 × 841 mm | Eight times as large |
| A0 | 841 × 1189 mm | Sixteen times as large |

Custom sizes can be set from 80 to 2000 mm per side. For accurate physical dimensions, export each layer as **SVG**, select the matching paper size in your printing application and print at **100% / actual size**. Large formats need a compatible printer or a print shop. Automatic splitting across A4 or A3 sheets is not included.

## Development

Requirements:

- Node.js 20 or newer
- pnpm 10 or newer

Install dependencies and verify the project:

```sh
pnpm install
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

The build command creates `dist/StencilBuilder.html` with all CSS and JavaScript embedded.

Optional synthetic QA images can be generated with Python and Pillow:

```sh
python -m pip install Pillow
python scripts/create_fixtures.py
```

The generated fixtures are stored in `.test-fixtures/` and are ignored by Git.

## Practical limitations

- The tool is designed for hand cutting, not direct laser-cutter or plotter control.
- Color-based background removal works best with simple, fairly even backgrounds.
- Automatic bridges improve cuttability, but every layer should still be inspected before cutting.
- Large custom sizes are exported at their requested dimensions; automatic tiling across multiple sheets is not included.
- Print at 100% or actual size so the registration marks and physical measurements stay accurate.

## License

Released under the [MIT License](LICENSE). You may use, modify and redistribute the code under its terms.
