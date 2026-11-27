/** IANA time zones the browser knows (profile and workspace defaults). */
export function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}
