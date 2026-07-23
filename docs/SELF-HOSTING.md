# Self-hosting Calpaca

Self-hosted mode is the default. It creates an installation workspace on the
first authenticated request with the `self_hosted` plan, which enables all
Calpaca capabilities without billing or a connection to calpaca.io.

Calpaca runs as one Bun application and one PostgreSQL 16 database. Background
jobs run inside the application process through pg-boss; Redis and a separate
worker are not required.

## Requirements

- Docker Engine with Docker Compose v2
- A domain name pointing to the host
- A TLS-terminating reverse proxy such as Caddy, Nginx, or Traefik
- Google OAuth credentials for organizer sign-in and calendar sync
- Optional SMTP credentials for invitations, reminders, and user invitations

## Start the stack

From the repository root:

```sh
cp .env.production.example .env
chmod 600 .env
```

Replace every `CHANGE_ME` value and set `BETTER_AUTH_URL` and `PUBLIC_URL` to
the final HTTPS origin. Then start the portable Compose stack:

```sh
docker compose -f deploy/compose.example.yml --env-file .env up -d --build
docker compose -f deploy/compose.example.yml --env-file .env ps
curl http://127.0.0.1:3000/health
```

The application is bound to loopback on port 3000. Put the reverse proxy on the
same host and forward the public HTTPS origin to `127.0.0.1:3000`. Do not
publish PostgreSQL to the internet.

Migrations run automatically when the application container starts. The
PostgreSQL data lives in the named `calpaca-db-data` volume.

## Google configuration

Create a Google OAuth client with application type **Web application**. Add:

```text
https://calendar.example.com/api/auth/callback/google
```

as an authorized redirect URI, replacing the example origin. Configure the
OAuth consent screen and enable the Google Calendar API. Put the client ID and
secret in `.env`.

`PUBLIC_URL` must be a stable public HTTPS origin for Google watch-channel
notifications. Without it, periodic sync still runs, but push updates cannot
be registered.

## Email

Set both `SMTP_URL` and `EMAIL_FROM` to enable booking messages, reminders, and
user invitations. If either is absent, Calpaca remains usable but skips email
delivery. A typical STARTTLS URL uses port 587:

```text
smtp://username:password@smtp.example.com:587
```

Keep credentials URL-encoded and store `.env` with restrictive permissions.

## Upgrade

Back up the database, fetch the desired revision, and rebuild:

```sh
docker compose -f deploy/compose.example.yml --env-file .env exec -T db \
  pg_dump -U calpaca -d calpaca > calpaca-backup.sql
git pull --ff-only
docker compose -f deploy/compose.example.yml --env-file .env up -d --build
curl https://calendar.example.com/health
```

Review release notes and migration files before upgrading. Database migrations
are forward-only; keep the backup until the new version has been exercised.

## Operations

Useful commands:

```sh
docker compose -f deploy/compose.example.yml --env-file .env logs -f app
docker compose -f deploy/compose.example.yml --env-file .env restart app
docker compose -f deploy/compose.example.yml --env-file .env down
```

`down` preserves the named database volume. Do not add `--volumes` unless you
intend to delete all Calpaca database data.

For a public deployment, also configure host firewall rules, automated
PostgreSQL backups, log retention, SMTP sender authentication, and monitoring
for `/health`.
