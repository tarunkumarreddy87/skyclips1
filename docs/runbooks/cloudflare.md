# Cloudflare cutover (DNS, CDN, SSL, security)

SkyClip public web should sit behind Cloudflare (orange-cloud proxy).

## Prerequisites

- Domain registered (or nameservers pointed at Cloudflare)
- Web origin: Vercel project `skyclip` **or** AWS ALB
- API origin: ALB paths `/health*`, `/projects*`, … (see ADR 0011 / ALB rules)

## Steps

1. **Add site** in Cloudflare → copy nameservers to registrar.
2. **DNS records**
   - `A`/`CNAME` `@` → Vercel (`cname.vercel-dns.com`) or ALB DNS
   - `www` → same
   - Optional `api` → ALB if you split API hostname
3. **SSL/TLS**
   - Mode: **Full (strict)** once origin has valid cert (Vercel handles this; ALB needs ACM or Cloudflare Origin Cert)
   - Enable **Always Use HTTPS**
4. **CDN / cache**
   - Bypass cache for `/api/*`, `/sign-in`, `/sign-up`, `/studio*` (Cache Rules → Bypass)
   - Cache static `_next/static/*` aggressively
5. **Security**
   - WAF managed rules (Cloudflare Free/Pro baseline)
   - Bot Fight Mode optional
   - Restrict ALB security group to Cloudflare IP ranges if locking down (advanced)
6. **App env**
   - Set `NEXT_PUBLIC_APP_URL=https://yourdomain.com`
   - Set `BETTER_AUTH_URL` to the same
   - Add domain to Better Auth `trustedOrigins` via env
   - Dodo webhook URL: `https://yourdomain.com/api/webhooks/dodo`

## Verify

- https://yourdomain.com loads with padlock
- `/api/auth/ok` or sign-up works over HTTPS
- Webhook deliveries show 2xx in Dodo dashboard
