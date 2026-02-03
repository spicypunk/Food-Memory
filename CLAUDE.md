# Project Rules

- EXIF GPS data (from exifr) returns latitude/longitude as strings. Convert with `Number()` before using number methods.
- Next.js caches API route responses by default. Add `export const dynamic = 'force-dynamic'` to API routes that fetch fresh data from the database.
