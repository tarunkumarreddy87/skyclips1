/** Use the configured public origin behind the AWS reverse proxy. Never trust forwarded hosts. */
export function appOrigin(requestUrl: string, configured = process.env.NEXT_PUBLIC_APP_URL): string {
  const url = new URL(configured?.trim() || requestUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid application URL');
  }
  return url.origin;
}
