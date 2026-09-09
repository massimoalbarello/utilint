// OAuth signatures cover repeated parameter names. Keep their URL representation intact;
// JSON-encoding a repeated parameter array would invalidate Better Auth's signed query.
export function parseSearch(search: string): Record<string, string | string[]> {
  const params = new URLSearchParams(search);
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length === 1 ? (values[0] ?? '') : values;
  }
  return result;
}
export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, String(entry));
  }
  return params.size ? `?${params}` : '';
}
