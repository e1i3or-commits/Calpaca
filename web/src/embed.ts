import {
  EMBED_MIN_HEIGHT,
  embedResizeHeight,
  parseBookingEmbedUrl,
} from "./lib/embed";

const STYLE_ID = "calpaca-embed-styles";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .calpaca-frame{display:block;width:100%;min-height:${EMBED_MIN_HEIGHT}px;border:0;border-radius:16px;background:#fff}
    .calpaca-dialog{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px}
    .calpaca-backdrop{position:absolute;inset:0;background:rgba(24,22,19,.58);backdrop-filter:blur(3px)}
    .calpaca-panel{position:relative;width:min(760px,100%);height:min(860px,calc(100dvh - 32px));overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 28px 90px rgba(0,0,0,.28)}
    .calpaca-panel .calpaca-frame{height:100%;min-height:100%;border-radius:18px}
    .calpaca-close{position:absolute;right:10px;top:10px;z-index:1;width:36px;height:36px;border:1px solid rgba(0,0,0,.12);border-radius:999px;background:#fff;color:#24221f;font:24px/1 Arial,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.12)}
    .calpaca-close:focus-visible{outline:3px solid #18794e;outline-offset:2px}
    @media(max-width:520px){.calpaca-dialog{padding:0}.calpaca-panel{width:100%;height:100dvh;border-radius:0}.calpaca-panel .calpaca-frame{border-radius:0}.calpaca-close{right:8px;top:8px}}
  `;
  document.head.append(style);
}

function createFrame(url: URL, title?: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = "calpaca-frame";
  frame.src = url.href;
  frame.title = title?.trim() || "Schedule a meeting";
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.setAttribute("allow", "clipboard-write");
  return frame;
}

const frames = new Map<HTMLIFrameElement, string>();

function onMessage(event: MessageEvent<unknown>) {
  for (const [frame, origin] of frames) {
    if (event.source !== frame.contentWindow || event.origin !== origin) continue;
    const height = embedResizeHeight(event.data);
    if (height === null) return;
    frame.style.height = `${height}px`;
    return;
  }
}

let listening = false;
function track(frame: HTMLIFrameElement, url: URL) {
  frames.set(frame, url.origin);
  if (!listening) {
    window.addEventListener("message", onMessage);
    listening = true;
  }
}

function mountInline(element: HTMLElement) {
  if (element.dataset.calpacaMounted === "true") return;
  const url = parseBookingEmbedUrl(element.dataset.calpacaInline ?? "", document.baseURI);
  if (!url) return;
  installStyles();
  const frame = createFrame(url, element.dataset.calpacaTitle);
  element.replaceChildren(frame);
  element.dataset.calpacaMounted = "true";
  track(frame, url);
}

function focusableWithin(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )];
}

function openPopup(trigger: HTMLElement, url: URL) {
  installStyles();
  const priorOverflow = document.body.style.overflow;
  const dialog = document.createElement("div");
  dialog.className = "calpaca-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", trigger.dataset.calpacaTitle?.trim() || "Schedule a meeting");

  const backdrop = document.createElement("div");
  backdrop.className = "calpaca-backdrop";
  const panel = document.createElement("div");
  panel.className = "calpaca-panel";
  const close = document.createElement("button");
  close.className = "calpaca-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close scheduling window");
  close.textContent = "×";
  const frame = createFrame(url, trigger.dataset.calpacaTitle);
  frame.loading = "eager";
  panel.append(frame, close);
  dialog.append(backdrop, panel);
  document.body.append(dialog);
  document.body.style.overflow = "hidden";

  const dismiss = () => {
    dialog.remove();
    document.body.style.overflow = priorOverflow;
    trigger.focus();
  };
  close.addEventListener("click", dismiss);
  backdrop.addEventListener("click", dismiss);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableWithin(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  close.focus();
}

function mountPopup(element: HTMLElement) {
  if (element.dataset.calpacaMounted === "true") return;
  const url = parseBookingEmbedUrl(element.dataset.calpacaPopup ?? "", document.baseURI);
  if (!url) return;
  element.dataset.calpacaMounted = "true";
  const nativelyInteractive = element.matches("button,a,[tabindex]");
  if (!nativelyInteractive) {
    element.tabIndex = 0;
    element.setAttribute("role", "button");
  }
  element.addEventListener("click", () => openPopup(element, url));
  if (!nativelyInteractive) {
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPopup(element, url);
      }
    });
  }
}

export function initCalpacaEmbeds(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-calpaca-inline]").forEach(mountInline);
  root.querySelectorAll<HTMLElement>("[data-calpaca-popup]").forEach(mountPopup);
}

declare global {
  interface Window {
    Calpaca?: { init: typeof initCalpacaEmbeds };
  }
}

if (typeof window !== "undefined") {
  window.Calpaca = { init: initCalpacaEmbeds };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initCalpacaEmbeds(), { once: true });
  } else {
    initCalpacaEmbeds();
  }
}
