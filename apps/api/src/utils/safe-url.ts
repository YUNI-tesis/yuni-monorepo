export function readSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isHttp = url.protocol === "https:" || url.protocol === "http:";
    return isHttp && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
