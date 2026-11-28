# Long-lead external tasks

Setup work outside the codebase that takes days or weeks (reviews, verifications, accounts). Start these early: the app works in fake mode until they are done. Values go in the server's `.env`, never in the repository.

| Task | Needed for | Lead time | Status |
|---|---|---|---|
| Google sign-in OAuth client | AUTH-03 (Google sign-in) | 1 hour (no review for basic scopes) | To do |
| Microsoft sign-in app registration | AUTH-03 (Microsoft sign-in) | 1 hour; publisher verification 1–3 weeks | To do |
| Google Gmail API app + restricted-scope verification (CASA) | MBX-03 (Gmail mailboxes, V1) | 4–8 weeks | Later |
| First BYOK data provider account | DISC-01 (Phase 2) | Days | Later |
| Domains, Cloudflare DNS, transactional email (SES/Resend) | Production email | Days | Later |
| Production setup: VPS, DNS, TLS, GitHub environments, B2 + age key, Sentry, Grafana Cloud, UptimeRobot ([OPS_SETUP.md](OPS_SETUP.md)) | First production release (Gate 1) | 1–2 days | To do |
| Legal drafts reviewed by counsel (ToS, Privacy, DPA, AUP) | Launch | Weeks | Later |

## Google sign-in (AUTH-03)

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project for the product.
2. **OAuth consent screen:** User type *External*. App name, support email, logo (optional), app domain and privacy policy URL. Scopes: only `openid`, `email` and `profile`. These are not sensitive, so no Google review is needed.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized redirect URI (exact): `https://<your-app-domain>/api/v1/auth/oauth/google/callback`
   - For local testing with real Google, also add `http://localhost:3300/api/v1/auth/oauth/google/callback`.
4. Put the client ID and secret in the server `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
5. Set `INTEGRATIONS_MODE=real` on that server. The "Continue with Google" button appears once both values are set.

Sign-in never requests Gmail access. Mailbox access is a separate app and consent (MBX-03, later).

## Microsoft sign-in (AUTH-03)

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), go to *App registrations → New registration*.
2. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" (multi-tenant + personal). The app uses the `common` endpoint.
3. **Redirect URI (Web, exact):** `https://<your-app-domain>/api/v1/auth/oauth/microsoft/callback` (plus the `localhost:3300` variant for local testing).
4. *Certificates & secrets → New client secret.* Copy the value now; it is shown only once. Note its expiry date and set a reminder to rotate it.
5. *API permissions:* Microsoft Graph delegated `openid`, `email`, `profile` (the defaults). No mail permissions.
6. Put the values in the server `.env`:
   ```
   MS_OAUTH_CLIENT_ID=<Application (client) ID>
   MS_OAUTH_CLIENT_SECRET=<secret value>
   ```
7. Recommended before launch: *Branding & properties → Publisher verification* (needs a Microsoft Partner Network ID). Until then, users see "unverified" on the consent screen.
