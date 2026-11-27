/** Only allow relative, same-site redirect targets (08-authentication §4.3: no open redirect). */
export function safeNext(next: string | undefined | null): string | undefined {
  if (!next || next.startsWith('//') || next.startsWith('/\\')) return undefined;
  return /^\/[A-Za-z0-9/_?=&%.~-]*$/.test(next) ? next : undefined;
}
