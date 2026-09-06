# Privacy

Stencil Builder is designed to process photographs without uploading them anywhere.

## What the app does

- Reads the image that you explicitly choose in the browser.
- Processes pixels locally with the browser's Canvas APIs.
- Keeps the active image and stencil result in temporary browser memory.
- Creates downloadable PNG and SVG files only when you press an export button.

## What the app does not do

- It does not send images or settings to a server.
- It does not use analytics, tracking, advertising, cookies or telemetry.
- It does not create an account or ask for personal information.
- It does not automatically save, synchronize or restore uploaded images.
- It does not use third-party APIs or remote assets.

Closing or reloading the page clears the current in-memory work. Exported files remain wherever your browser saved them.

## Repository hygiene

The repository intentionally excludes personal source images and user-generated exports. Keep private photographs in a separate folder such as `private/`, `uploads/` or `outputs/`; these names are covered by `.gitignore`.

Before contributing, check your changes for photographs, names, email addresses, access tokens, passwords, API keys and absolute paths from your computer.
