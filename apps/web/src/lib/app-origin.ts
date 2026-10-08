/**
 * Resolve the browser-facing origin used after OAuth.
 *
 * Older AWS deployments used an ALB hostname in NEXT_PUBLIC_APP_URL. That
 * value must never win when the app is now running on Vercel/custom domains,
 * otherwise Supabase sends users back to the retired ALB after login.
 */
export function appOrigin(requestUrl: string, configured = process.env.NEXT_PUBLIC_APP_URL): string {
  const request = new URL(requestUrl);
  const candidate = configured?.trim();
  const configuredUrl = candidate ? new URL(candidate) : null;
  const isRetiredAlb = configuredUrl?.hostname.endsWith('.elb.amazonaws.com') ?? false;
  const url = configuredUrl && !isRetiredAlb ? configuredUrl : request;
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid application URL');
  }
  return url.origin;
}
