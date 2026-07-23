# Embedding Calpaca

Calpaca's small embed loader supports inline booking pages and accessible
popups. Both modes use the same public `/book/<event-type>` page and resize
messages are accepted only from the expected iframe window and Calpaca origin.

## Inline

```html
<div data-calpaca-inline="https://calendar.example.com/book/intro-call"></div>
<script async src="https://calendar.example.com/embed.js"></script>
```

The loader creates a responsive iframe and updates its height as the booking
flow changes. Add `data-calpaca-title="Book an intro call"` to customize its
accessible title.

## Popup

```html
<button
  type="button"
  data-calpaca-popup="https://calendar.example.com/book/intro-call"
>
  Book a meeting
</button>
<script async src="https://calendar.example.com/embed.js"></script>
```

The popup traps keyboard focus, closes with Escape or the backdrop, restores
focus to its trigger, and becomes full-screen on small devices.

The loader automatically initializes matching elements present when it loads.
For elements added later:

```js
window.Calpaca.init();
```

## Content Security Policy

If the host website uses Content Security Policy, allow the Calpaca origin:

```text
script-src 'self' https://calendar.example.com;
frame-src https://calendar.example.com;
```

Calpaca permits framing only on public booking routes. Organizer pages do not
send the booking-page `frame-ancestors` policy.

## Security notes

- Use an HTTPS Calpaca origin in production.
- The loader accepts only HTTP(S) URLs whose path begins with `/book/`.
- Resize messages carry layout dimensions only; booking or invitee data is
  never sent to the parent page.
- The parent verifies both `event.source` and `event.origin` before resizing.
- Keep the booking and loader URLs on the same Calpaca origin.
