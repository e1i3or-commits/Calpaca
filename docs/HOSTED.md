# Hosted Calpaca

Calpaca supports two distribution modes:

- **Hosted:** paid accounts operated by Calpaca.
- **Self-hosted:** the complete AGPL application deployed on infrastructure
  controlled by the operator, without a Calpaca billing dependency.

## Domain model

- `calpaca.io` — product site, documentation, signup, and public booking
  namespace.
- `app.calpaca.io` — authenticated organizer application.
- Verified custom domains — workspace-specific booking surfaces. TourScale
  continues to use `cal.tourscale.com`.

DNS records are changed only after their deployment targets and certificate
flow exist. Porkbun API access is operational infrastructure, not an
application runtime dependency.

## Hosted prerequisites

Before public account creation, the application needs:

1. Workspace ownership on every tenant-scoped record and tested isolation.
2. Workspace membership and role checks at the API boundary.
3. Plan entitlements for limits and paid capabilities.
4. Subscription lifecycle handling with an auditable provider event log.
5. Verified custom-domain mapping and automated TLS.
6. Documented export, deletion, retention, backup, and recovery behavior.

The self-hosted build keeps the same scheduling features and bypasses hosted
billing through an explicit deployment mode rather than hidden license checks.

## Current foundation

The application now persists workspace membership, workspace roles, plan
entitlements, and custom-domain verification state. Existing installations
are lazily backfilled into one `self_hosted` workspace at the first
authenticated request.

Set these variables for the public hosted service:

```env
CALPACA_DEPLOYMENT_MODE=hosted
CALPACA_WORKSPACE_NAME=Calpaca
```

Self-hosted installations omit `CALPACA_DEPLOYMENT_MODE` (or set it to
`self_hosted`) and receive all product capabilities without contacting a
billing service.

Adding a custom hostname in the dashboard returns a unique TXT proof at
`_calpaca.<hostname>`. A domain does not resolve to its workspace until that
proof has been checked and its status is marked verified. Automated DNS
verification and certificate provisioning are the next domain-operations
slice; no registrar credentials are stored in the application database.
