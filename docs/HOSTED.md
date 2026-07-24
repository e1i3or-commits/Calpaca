# Hosted Calpaca

Calpaca supports two distribution modes:

- **Calpaca Cloud:** managed accounts operated by Calpaca. Cloud Basic is free
  for one user. Cloud Pro is $7 per user each month for teams and premium
  administration.
- **Community Edition:** the complete AGPL application deployed on
  infrastructure controlled by the operator, without a Calpaca billing
  dependency.

Cloud pricing pays for convenience: automatic updates, backups, managed email
delivery, hosted integrations, monitoring, billing, and support. Calpaca does
not sell software licenses or restrict the Community Edition to create an
upgrade path.

## Domain model

- `calpaca.io` — product site, documentation, signup, and public booking
  namespace.
- `app.calpaca.io` — authenticated organizer application.
- Verified custom domains — workspace-specific booking surfaces.

DNS records are changed only after their deployment targets and certificate
flow exist. Porkbun API access is operational infrastructure, not an
application runtime dependency.

## Hosted operating requirements

The hosted service depends on:

1. Workspace ownership and tested isolation for tenant-scoped records.
2. Workspace membership and role checks at the API boundary.
3. Plan entitlements for hosted limits and paid capabilities.
4. An auditable subscription lifecycle.
5. Verified custom-domain mapping and automated TLS.
6. Documented export, deletion, retention, backup, and recovery procedures.

The self-hosted build keeps the same scheduling features and bypasses hosted
billing through an explicit deployment mode rather than hidden license checks.

## Current foundation

The application now persists workspace membership, workspace roles, plan
entitlements, and custom-domain verification state. Event types, bookings,
routing forms, webhook subscriptions, and organizer analytics carry an
explicit workspace key. Existing installations are migrated into one
`self_hosted` workspace; legacy inserts infer that workspace at the database
boundary.

Hosted public links include the workspace slug:

```text
https://calpaca.io/book/<workspace>/<event-type>
https://calpaca.io/r/<workspace>/<routing-form>
```

On a verified custom hostname the workspace comes from the hostname, keeping
the shorter `/book/<event-type>` and `/r/<routing-form>` forms. Organizer link
and embed generators prefer the primary verified hostname, then the hosted
namespace.

Set these variables for the public hosted service:

```env
CALPACA_DEPLOYMENT_MODE=hosted
CALPACA_WORKSPACE_NAME=Calpaca
BETTER_AUTH_URL=https://app.calpaca.io
PUBLIC_URL=https://app.calpaca.io
```

Self-hosted installations omit `CALPACA_DEPLOYMENT_MODE` (or set it to
`self_hosted`) and receive all product capabilities without contacting a
billing service.

Adding a custom hostname in the dashboard returns a unique TXT proof at
`_calpaca.<hostname>`. **Verify DNS** checks that proof before activating the
hostname. When Nginx Proxy Manager provisioning variables are configured, the
same action creates the proxy host and Let's Encrypt certificate
idempotently. Registrar credentials are never stored in the application
database or required by the application.

```env
NPM_API_URL=http://htz-npm:81/api
NPM_ADMIN_EMAIL=...
NPM_ADMIN_PASSWORD=...
NPM_LETSENCRYPT_EMAIL=admin@calpaca.io
CUSTOM_DOMAIN_FORWARD_HOST=ts-scheduler-app
CUSTOM_DOMAIN_FORWARD_PORT=3000
```

Before changing `BETTER_AUTH_URL`, register
`https://app.calpaca.io/api/auth/callback/google` on the Google OAuth web
client. Keep the previous callback during the transition.
