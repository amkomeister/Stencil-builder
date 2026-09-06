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
- A4, A3, portrait, landscape and custom millimetre dimensions
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
