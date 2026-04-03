# PaperDock

PaperDock is a browser-first PDF utility app with three actions:

- Compress a PDF to reduce file size
- Merge multiple PDFs into one document
- Split a PDF into page-range-based files

Everything runs locally in the browser, so the app can be hosted as a free static site on GitHub Pages or Render.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build for deployment

```bash
npm run build
```

The production site is generated in `dist/`.

## How the actions work

### Compress

Compression first tries a structural re-save, then falls back to page rasterization with different quality presets and downloads the smallest result that actually beats the original size. This keeps the app static-hostable, but on already-compact vector PDFs there may be no smaller output to download.

### Merge

The merge flow combines all pages from the selected PDFs in the order shown in the UI.

### Split

The split flow accepts page groups like `1-3, 4-6, 7` and downloads all generated PDFs as a zip file.

## Free deployment

### GitHub Pages

1. Push this project to a GitHub repository.
2. Run `npm install`.
3. Run `npm run build`.
4. Publish the `dist/` directory with GitHub Pages or a GitHub Actions workflow.

### Render

Create a Static Site in Render and use:

- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

## Stack

- React + Vite
- `pdf-lib` for merge and split
- `pdfjs-dist` + `jspdf` for compression
- `jszip` for split-download packaging
