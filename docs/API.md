# API reference

Calpaca publishes its OpenAPI 3.1 document at `/openapi.json` and serves a
searchable, dependency-free reference at `/api-docs`. On Calpaca Cloud:

- [Searchable API reference](https://app.calpaca.io/api-docs)
- [OpenAPI JSON](https://app.calpaca.io/openapi.json)

The checked-in [`openapi.json`](openapi.json) is suitable for client
generation and offline tooling. Organizer endpoints accept the browser session
created by Google sign-in. Personal API tokens can also authenticate organizer
requests:

```http
Authorization: Bearer calpaca_your_token
```

Generate tokens under **Profile & API** in the organizer dashboard. The full
secret is shown once, stored only as a SHA-256 hash, and can be revoked at any
time. Public booking endpoints do not require a session. Provider webhook
authentication is described per operation.

## Updating the document

When an endpoint is added or removed, update the operation registry in
`src/api/openapi.ts`, then regenerate the checked-in document:

```sh
bun run openapi:generate
```

The test suite compares the registry with Hono's declared routes and compares
the generated output with `docs/openapi.json`. Either kind of drift fails the
normal verification gate.

Better Auth owns the implementation-specific `/api/auth/*` endpoints. They
are intentionally excluded from this application API document.
