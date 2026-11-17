// Labspace bridge: terminals of your own machine, for the Labspace interface.
//
// The Labspace interface, started with WORKSPACE_TYPE=ttyd, shows http://localhost:8085 in its
// right panel and sends its buttons to this server:
//   POST /api/command {cmd, terminalId?}  types cmd into a terminal and presses Enter
//   POST /api/save    {filePath, body}    writes a file, relative to the workspace (or ~/...)
// Both need "Authorization: Bearer $LABSPACE_TOKEN".
//
// The page at / is a set of xterm.js tabs, each one a real shell (node-pty) on this machine.
// A Run button with `terminal-id=<name>` opens (or reuses) the tab of that name: the lab uses
// terminal-2, terminal-3 and terminal-4, shown as "Terminal 2"…
//
// It listens on 127.0.0.1 only, and checks the Host and Origin headers, so that another web
// page or another machine can't type into your shell.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";
import { WebSocketServer } from "ws";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRIDGE_PORT || 8085);
const BIND = process.env.BRIDGE_BIND || "127.0.0.1";
const TOKEN = process.env.LABSPACE_TOKEN;
const WORKSPACE = path.resolve(process.env.LABSPACE_WORKSPACE || path.join(here, "..", ".."));
// Blocks without a terminal-id run in Terminal 1; the lab names the others terminal-2, -3, -4
const DEFAULT_TERMINAL = "terminal-1";
const SCROLLBACK_BYTES = 256 * 1024;

if (!TOKEN || TOKEN.length < 16) {
  console.error("LABSPACE_TOKEN must be set (16+ characters). Start the bridge with ../start.sh.");
  process.exit(1);
}

// Requests must name this server: blocks DNS rebinding from a web page.
const allowedHosts = new Set(
  ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].map((h) => `${h}:${PORT}`),
);
// The terminal page is the only page allowed to open the WebSocket.
const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

// ---------------------------------------------------------------- terminals

const terminals = new Map(); // id -> { pty, scrollback, exited }
const clients = new Set(); // open WebSockets of the terminal page
let lastSize = { cols: 100, rows: 30 };

function shellCommand() {
  if (process.platform === "win32") return { file: "powershell.exe", args: [] };
  return { file: process.env.SHELL || "/bin/bash", args: ["-l"] };
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

function listMessage(focus) {
  return { t: "list", ids: [...terminals.keys()], focus };
}

function ensureTerminal(id = DEFAULT_TERMINAL) {
  const existing = terminals.get(id);
  if (existing && !existing.exited) return existing;

  const { file, args } = shellCommand();
  const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", LABSPACE_TERMINAL: id };
  delete env.LABSPACE_TOKEN;

  const term = {
    pty: pty.spawn(file, args, { name: "xterm-256color", cwd: WORKSPACE, env, ...lastSize }),
    scrollback: existing ? existing.scrollback + "\r\n\x1b[2m[new shell]\x1b[0m\r\n" : "",
    exited: false,
    // Input sent before the shell prints its prompt would be echoed twice: hold it until then.
    pending: [],
    ready: false,
    // Whether the program in the terminal asked for bracketed paste (\e[?2004h): zsh at its prompt,
    // and agent CLIs such as Copilot. Then a pasted block arrives as one piece of text.
    bracketedPaste: false,
    write(data) {
      if (this.ready) this.pty.write(data);
      else this.pending.push(() => this.pty.write(data));
    },
    // Types a Run block and presses Enter. With bracketed paste, a multi-line block is pasted whole,
    // so a prompt reaches the agent as one message and a shell gets every line before Enter;
    // without it, each line is typed and entered in turn.
    run(text) {
      const go = () => {
        const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
        if (this.bracketedPaste) {
          this.pty.write(`\x1b[200~${lines.replace(/\n/g, "\r")}\x1b[201~`);
          // Enter as its own key press, once the program has taken the paste in
          setTimeout(() => !this.exited && this.pty.write("\r"), 60);
        } else {
          this.pty.write(lines.replace(/\n/g, "\r") + "\r");
        }
      };
      if (this.ready) go();
      else this.pending.push(go);
    },
  };
  const markReady = () => {
    if (term.ready) return;
    term.ready = true;
    for (const send of term.pending.splice(0)) send();
  };
  // Some shells (or slow login profiles) print nothing for a while; don't wait forever.
  setTimeout(markReady, 3000);
  // Input typed before the shell's line editor reads it is echoed raw (a stray "^[[201~" around a
  // paste). The prompt is no sign: zsh themes with an "instant prompt" (powerlevel10k) draw it, with
  // bracketed paste on, at once, while the shell still loads for a few hundred milliseconds. So wait
  // for the output to pause, and at least a second after the start.
  const started = Date.now();
  let readyTimer;
  term.pty.onData((data) => {
    const on = data.lastIndexOf("\x1b[?2004h");
    const off = data.lastIndexOf("\x1b[?2004l");
    if (on !== off) term.bracketedPaste = on > off;
    if (!term.ready) {
      clearTimeout(readyTimer);
      readyTimer = setTimeout(markReady, Math.max(300, 1000 - (Date.now() - started)));
    }
    term.scrollback = (term.scrollback + data).slice(-SCROLLBACK_BYTES);
    broadcast({ t: "out", id, data });
  });
  term.pty.onExit(({ exitCode }) => {
    term.exited = true;
    const note = `\r\n\x1b[2m[shell exited with code ${exitCode}; the next command starts a new one]\x1b[0m\r\n`;
    term.scrollback += note;
    broadcast({ t: "out", id, data: note });
  });

  terminals.set(id, term);
  broadcast(listMessage(id));
  return term;
}

function closeTerminal(id) {
  const term = terminals.get(id);
  if (!term) return;
  if (!term.exited) term.pty.kill();
  terminals.delete(id);
  broadcast(listMessage(terminals.keys().next().value));
}

// ---------------------------------------------------------------- HTTP

const staticFiles = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/xterm.css": ["node_modules/@xterm/xterm/css/xterm.css", "text/css"],
  "/xterm.js": ["node_modules/@xterm/xterm/lib/xterm.js", "text/javascript"],
  "/addon-fit.js": ["node_modules/@xterm/addon-fit/lib/addon-fit.js", "text/javascript"],
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const given = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("body too large");
  }
  return JSON.parse(raw || "{}");
}

// Same rules as the Labspace VS Code extension: relative to the workspace, or ~/ for the home folder.
function resolveSavePath(filePath) {
  if (typeof filePath !== "string" || !filePath) throw new Error("missing filePath");
  if (filePath === "~" || filePath.startsWith("~/")) {
    const target = path.resolve(os.homedir(), filePath.slice(2));
    if (!target.startsWith(os.homedir() + path.sep)) throw new Error("path leaves the home folder");
    return target;
  }
  const target = path.resolve(WORKSPACE, filePath);
  if (!target.startsWith(WORKSPACE + path.sep)) throw new Error("path leaves the workspace");
  return target;
}

// The interface takes a block's code from the raw Markdown: for a block inside a quote or an alert
// (> [!TIP]), every line still starts with the quote's "> ", which the shell would read as a
// redirection. Removes the quote markers, as many levels as every line has.
function unquote(code) {
  const lines = code.split("\n");
  while (lines.length && lines.every((line) => /^ {0,3}>/.test(line))) {
    for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/^ {0,3}> ?/, "");
  }
  return lines.join("\n");
}

const server = http.createServer(async (req, res) => {
  if (!allowedHosts.has(req.headers.host)) return send(res, 403, { error: "unexpected Host header" });
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && staticFiles[url.pathname]) {
    const [file, type] = staticFiles[url.pathname];
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      // Only the Labspace interface may frame the terminal page
      "Content-Security-Policy": "frame-ancestors http://localhost:3030 http://127.0.0.1:3030",
    });
    return fs.createReadStream(path.join(here, file)).pipe(res);
  }

  if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });

  if (req.method === "POST" && url.pathname.startsWith("/api/")) {
    if (!authorized(req)) return send(res, 401, { error: "bad token" });
    try {
      const body = await readJson(req);

      if (url.pathname === "/api/command") {
        if (typeof body.cmd !== "string" || !body.cmd) throw new Error("missing cmd");
        body.cmd = unquote(body.cmd);
        const id = typeof body.terminalId === "string" && body.terminalId ? body.terminalId : DEFAULT_TERMINAL;
        const term = ensureTerminal(id);
        // Bracketed-paste would be nicer for multi-line blocks, but most shells handle \r per line.
        term.run(body.cmd);
        broadcast({ t: "focus", id });
        console.log(`[run:${id}] ${body.cmd.split("\n")[0]}${body.cmd.includes("\n") ? " …" : ""}`);
        return send(res, 200, { ok: true });
      }

      if (url.pathname === "/api/save") {
        if (typeof body.body !== "string") throw new Error("missing body");
        body.body = unquote(body.body);
        const target = resolveSavePath(body.filePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body.body);
        console.log(`[save] ${target}`);
        return send(res, 200, { ok: true, path: target });
      }
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  send(res, 404, { error: "not found" });
});

// ---------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const ok =
    allowedHosts.has(req.headers.host) &&
    allowedOrigins.has(req.headers.origin) &&
    new URL(req.url, "http://x").pathname === "/ws";
  if (!ok) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

// Several pages may show the same shells (two browser tabs, a reload). Each xterm.js answers the
// queries programs send to the terminal (background color, cursor position, device attributes), so
// only one page may send input: the last one connected or used. Otherwise the extra answers
// arrive in the shell as typed text, like "11;rgb:0b0b/1010/2020".
let inputOwner = null;

wss.on("connection", (ws) => {
  clients.add(ws);
  inputOwner = ws;
  ensureTerminal(DEFAULT_TERMINAL);
  ws.send(JSON.stringify(listMessage(DEFAULT_TERMINAL)));
  for (const [id, term] of terminals) ws.send(JSON.stringify({ t: "out", id, data: term.scrollback, replay: true }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "claim") {
      inputOwner = ws;
      return;
    }
    if (typeof msg.id !== "string" || msg.id.length > 64) return;
    if (msg.t === "in" && typeof msg.data === "string") {
      if (ws === inputOwner) ensureTerminal(msg.id).write(msg.data);
    }
    else if (msg.t === "resize" && msg.cols > 0 && msg.rows > 0) {
      lastSize = { cols: Math.min(msg.cols, 500), rows: Math.min(msg.rows, 200) };
      const term = terminals.get(msg.id);
      if (term && !term.exited) term.pty.resize(lastSize.cols, lastSize.rows);
    } else if (msg.t === "open") ensureTerminal(msg.id);
    else if (msg.t === "close") closeTerminal(msg.id);
  });
  ws.on("close", () => {
    clients.delete(ws);
    if (inputOwner === ws) inputOwner = [...clients].pop() || null;
  });
});

server.listen(PORT, BIND, () => {
  console.log(`Labspace bridge on http://localhost:${PORT} (shells start in ${WORKSPACE})`);
});

function shutdown() {
  for (const term of terminals.values()) if (!term.exited) term.pty.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
