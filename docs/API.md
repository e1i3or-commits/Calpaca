# API reference

Calpaca publishes its OpenAPI 3.1 document at `/openapi.json` and serves a
searchable, dependency-free reference at `/api-docs`. On the TourScale
installation:

- [Searchable API reference](https://cal.tourscale.com/api-docs)
- [OpenAPI JSON](https://cal.tourscale.com/openapi.json)

The checked-in [`openapi.json`](openapi.json) is suitable for client
generation and offline tooling. Organizer endpoints use the browser session
created by Google sign-in. Public booking endpoints do not require a session.
Provider webhook authentication is described per operation.

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
