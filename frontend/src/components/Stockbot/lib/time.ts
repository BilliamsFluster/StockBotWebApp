export function formatLocalTime(iso?: string): string {
  try {
    if (!iso) return '';
    // If timestamp lacks timezone offset/Z, treat it as UTC
    const needsZ = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?)(\.\d+)?$/.test(iso);
    const s = needsZ ? iso + 'Z' : iso;
    const d = new Date(s);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso || '';
  }
}

