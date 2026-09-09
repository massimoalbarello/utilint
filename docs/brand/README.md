# Utilint logo

`utilint-logo.png` is the approved original artwork. Its upward-facing, rounded fingerprint
curves suggest a lowercase **u**.

The frontend uses a lossless WebP copy in `apps/frontend/src/assets/utilint-logo.webp`.
Regenerate it without changing the image pixels:

```sh
cwebp -lossless -exact -m 6 docs/brand/utilint-logo.png -o apps/frontend/src/assets/utilint-logo.webp
```

The shared `Brand` component frames the artwork without its white presentation margins and
pairs it with the Utilint wordmark. Its decorative icon is hidden from assistive technology;
the wordmark supplies the accessible name. Both the workspace header and public layout use it,
including all hosted consent states.
