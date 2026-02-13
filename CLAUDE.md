# Project Rules

- EXIF GPS data (from exifr) returns latitude/longitude as strings. Convert with `Number()` before using number methods.
- Next.js caches API route responses by default. Add `export const dynamic = 'force-dynamic'` to API routes that fetch fresh data from the database.
- Use `{ cache: 'no-store' }` on client-side fetch calls so the browser doesn't serve stale cached responses.
- After editing multiple files, the Next.js dev server often gets stuck (page shows "Loading food memories..." forever because JS bundles fail to load). When this happens, tell the user to restart the dev server: `Ctrl+C` then `npx next dev`.