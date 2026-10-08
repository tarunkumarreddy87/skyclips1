# Social login deployment checklist

Google and Apple OAuth use Supabase PKCE and the server-side /auth/callback code exchange. Return destinations are restricted to internal application routes. Sign-out returns to the landing page.

Provider settings checked September 20, 2026: Google disabled, Apple disabled, email enabled. Provider credentials must be configured before social login works. Never put provider secrets in NEXT_PUBLIC variables or commit them.

1. Google: create a Web OAuth client in Google Cloud, using the Supabase provider callback as the authorized redirect URI. Add the client ID and secret in Supabase Authentication > Providers > Google and enable it.
2. Apple: configure the Apple Services ID and signing credentials in Supabase. Follow Apple's domain verification and return URL requirements, and rotate expiring secrets.
3. Supabase URL Configuration must allow http://localhost:3000/auth/callback for development and the HTTPS production callback, including the next query parameter used by the app. Set the production Site URL.
4. Test provider consent, cancellation, expired codes, returning users and sign-out.

References: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/auth/social-login/auth-apple

The carousel uses the requested Remocn Inline Pill Takeover, Centered Word Build and Type Fossil source components. Playback pauses for hidden tabs and reduced-motion preferences. Below 900px the showcase stacks below the form.
