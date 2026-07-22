// Dev-only SMTP capture server: accepts every message and dumps the raw
// MIME to logs/smtp-sink/ so invite emails can be inspected without ever
// sending real mail. Point the app at it with SMTP_URL=smtp://127.0.0.1:2525.
//
//   bun run scripts-dev/smtp-sink.ts
//
// Speaks just enough SMTP for nodemailer without auth or TLS. Not a mail
// server; do not expose beyond localhost.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.SMTP_SINK_PORT ?? 2525);
const OUT_DIR = join(import.meta.dir, "..", "logs", "smtp-sink");
mkdirSync(OUT_DIR, { recursive: true });

let messageCount = 0;

type ConnState = {
  buffer: string;
  inData: boolean;
  envelope: { from: string; to: string[] };
};

function freshEnvelope() {
  return { from: "", to: [] as string[] };
}

function handleLine(socket: Bun.Socket<ConnState>, line: string): void {
  const state = socket.data;
  const verb = line.slice(0, 4).toUpperCase();

  if (verb === "EHLO" || verb === "HELO") {
    socket.write("250-smtp-sink\r\n250 8BITMIME\r\n");
  } else if (verb === "MAIL") {
    state.envelope.from = line.replace(/^MAIL FROM:\s*/i, "").replace(/[<>]/g, "");
    socket.write("250 OK\r\n");
  } else if (verb === "RCPT") {
    state.envelope.to.push(line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, ""));
    socket.write("250 OK\r\n");
  } else if (verb === "DATA") {
    state.inData = true;
    socket.write("354 End with <CRLF>.<CRLF>\r\n");
  } else if (verb === "RSET") {
    state.envelope = freshEnvelope();
    socket.write("250 OK\r\n");
  } else if (verb === "QUIT") {
    socket.write("221 Bye\r\n");
    socket.end();
  } else if (verb === "NOOP") {
    socket.write("250 OK\r\n");
  } else {
    socket.write("250 OK\r\n"); // accept anything else; this is a sink
  }
}

function saveMessage(socket: Bun.Socket<ConnState>, raw: string): void {
  const state = socket.data;
  messageCount += 1;
  const name = `${String(messageCount).padStart(3, "0")}.eml`;
  const path = join(OUT_DIR, name);
  const header = `X-Sink-Envelope-From: ${state.envelope.from}\r\nX-Sink-Envelope-To: ${state.envelope.to.join(", ")}\r\n`;
  // SMTP dot-stuffing: leading ".." on a line means a literal "."
  writeFileSync(path, header + raw.replace(/\r\n\.\./g, "\r\n."));
  const subject = /^Subject: (.*)$/m.exec(raw)?.[1] ?? "(no subject)";
  console.log(`[smtp-sink] #${messageCount} to=${state.envelope.to.join(",")} subject=${subject.trim()} -> ${path}`);
  state.envelope = freshEnvelope();
  socket.write("250 OK: queued\r\n");
}

Bun.listen<ConnState>({
  hostname: "127.0.0.1",
  port: PORT,
  socket: {
    open(socket) {
      socket.data = { buffer: "", inData: false, envelope: freshEnvelope() };
      socket.write("220 smtp-sink ready\r\n");
    },
    data(socket, chunk) {
      const state = socket.data;
      state.buffer += chunk.toString();
      // alternate between payload mode and command mode until the buffer
      // has no complete unit left — handles pipelined DATA + payload chunks
      for (;;) {
        if (state.inData) {
          const end = state.buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          const raw = state.buffer.slice(0, end + 2);
          state.buffer = state.buffer.slice(end + 5);
          state.inData = false;
          saveMessage(socket, raw);
        } else {
          const nl = state.buffer.indexOf("\r\n");
          if (nl === -1) return;
          const line = state.buffer.slice(0, nl);
          state.buffer = state.buffer.slice(nl + 2);
          if (line) handleLine(socket, line);
        }
      }
    },
  },
});

console.log(`[smtp-sink] listening on 127.0.0.1:${PORT}, writing to ${OUT_DIR}`);
