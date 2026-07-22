/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['better-sqlite3'],
  // Demo-safe setting: disables the Next.js dev tools overlay so it never
  // appears in `npm run demo` (e.g. Loom recordings). Next 15.5's
  // `devIndicators` type is `false | { appIsrStatus?, buildActivity?,
  // buildActivityPosition?, position? }` — the boolean-form `false` is the
  // documented, non-deprecated way to fully disable it (only the object's
  // sub-fields are deprecated).
  devIndicators: false,
}
