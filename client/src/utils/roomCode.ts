export function normalizeRoomCode(input: string | null | undefined): string {
  if (!input) return '';

  // Some entry points accidentally include query/hash fragments (e.g. "ABC123?debug=1").
  // Strip anything after common delimiters and normalize casing/whitespace.
  const trimmed = String(input).trim();
  const stripped = trimmed.split('#')[0].split('?')[0].split('&')[0].trim();

  return stripped.toUpperCase();
}
