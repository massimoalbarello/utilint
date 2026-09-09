# Utilint logo

`utilint-logo.png` is the approved original artwork. Its upward-facing, rounded fingerprint
curves suggest a lowercase **u**.

The portal, sign-in, and every hosted consent state use the shared `Brand` component with
[`utilint-logo.svg`](../../apps/frontend/src/assets/utilint-logo.svg). This is a transparent,
path-only vector traced from the approved PNG with Potrace (threshold 128, speckle suppression
12, curve optimization tolerance 0.2). Its viewBox removes the presentation margins while
preserving the shape and proportions. The repository README uses the same SVG.

The original PNG and its lossless WebP copy remain available as raster alternatives.
Regenerate the WebP without changing the image pixels:

```sh
cwebp -lossless -exact -m 6 docs/brand/utilint-logo.png -o apps/frontend/src/assets/utilint-logo.webp
```

The mark is paired with the Utilint wordmark. Its empty image alt text avoids repeating the
adjacent wordmark, which supplies the accessible name.
