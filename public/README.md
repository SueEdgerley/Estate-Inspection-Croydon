# Public Assets

This directory contains static public assets such as:
- Images
- Icons
- Fonts
- Other static files

## Croydon Council logo (required for header)

Place the official logo file in this folder:

| File | Purpose |
|------|--------|
| **`public/croydon-housing-logo.png`** | Main app header (top left), Neighbourhood Voice wizard intro, and anywhere `/croydon-housing-logo.png` is referenced |

Use a PNG or SVG (if you use SVG, name it `croydon-housing-logo.png` only if your build serves it; otherwise keep **PNG** for broad compatibility). Prefer transparent background. Recommended height at source ~80–120px; the header scales with `clamp` for mobile. Alt text: "Croydon Council".
