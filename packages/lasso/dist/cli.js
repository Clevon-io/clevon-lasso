#!/usr/bin/env node

// src/cli.ts
import { readFileSync as readFileSync2 } from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/server/inbox.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
var MAX_BODY = 50 * 1024 * 1024;
function defaultInboxDir(projectDir = process.cwd()) {
  const abs = path.resolve(projectDir);
  const hash = createHash("sha1").update(abs).digest("hex").slice(0, 6);
  return path.join(homedir(), ".clevon-lasso", `${path.basename(abs)}-${hash}`);
}
function createInbox(dir) {
  const file = path.join(dir, "inbox.jsonl");
  const imagesDir = path.join(dir, "images");
  const cursorFile = path.join(dir, "cursor");
  async function append(payload) {
    if (typeof payload.message !== "string" || !payload.message.trim()) throw new Error("message required");
    const id = `fb-${Date.now().toString(36)}`;
    await mkdir(imagesDir, { recursive: true });
    const urls = Array.isArray(payload.images) ? payload.images.filter((v) => typeof v === "string") : [];
    const images = [];
    for (const [i, dataUrl] of urls.entries()) {
      const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
      if (!match) continue;
      const out = path.join(imagesDir, `${id}-${i + 1}.${match[1] === "jpeg" ? "jpg" : match[1]}`);
      await writeFile(out, Buffer.from(match[2], "base64"));
      images.push(out);
    }
    const entry = {
      id,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      page: payload.page ?? null,
      url: payload.url ?? null,
      viewport: payload.viewport ?? null,
      images,
      message: payload.message
    };
    await appendFile(file, `${JSON.stringify(entry)}
`);
    return entry;
  }
  function readAll() {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  }
  async function readCursor() {
    const raw = await readFile(cursorFile, "utf8").catch(() => "0");
    return Number.parseInt(raw, 10) || 0;
  }
  async function takeUnread() {
    const all = readAll();
    const cursor = await readCursor();
    if (all.length <= cursor) return [];
    await mkdir(dir, { recursive: true });
    await writeFile(cursorFile, String(all.length));
    return all.slice(cursor);
  }
  return { dir, file, append, readAll, takeUnread };
}
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function handleFeedbackRequest(req, res, inbox2) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return true;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return true;
  }
  try {
    const entry = await inbox2.append(JSON.parse(await readBody(req)));
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: entry.id }));
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(error) }));
  }
  return true;
}
function formatEntry(entry) {
  const when = new Date(entry.at).toLocaleString("ko-KR", { hour12: false });
  const size = entry.viewport ? ` (${entry.viewport.width}\xD7${entry.viewport.height})` : "";
  return [
    `\u2500\u2500 Lasso \uD53C\uB4DC\uBC31 ${entry.id} \xB7 ${when} \xB7 ${entry.url ?? entry.page ?? ""}${size}`,
    entry.message,
    entry.images.length ? `\uC774\uBBF8\uC9C0: ${entry.images.join(" ")}` : "\uC774\uBBF8\uC9C0: \uC5C6\uC74C",
    ""
  ].join("\n");
}

// src/server/proxy.ts
import http from "node:http";
import net from "node:net";
var TAG = Buffer.from('<script src="/__lasso/client.js" async></script>');
function inject(upstream, res) {
  let pending = Buffer.alloc(0);
  upstream.on("data", (chunk) => {
    if (!pending) return void res.write(chunk);
    pending = Buffer.concat([pending, chunk]);
    const head = pending.indexOf("<head");
    const close = head < 0 ? -1 : pending.indexOf(">", head);
    if (close < 0) return;
    res.write(Buffer.concat([pending.subarray(0, close + 1), TAG, pending.subarray(close + 1)]));
    pending = null;
  });
  upstream.on("end", () => {
    if (pending) res.write(Buffer.concat([pending, TAG]));
    res.end();
  });
}
function startProxy(options) {
  const targetHost = options.targetHost ?? "localhost";
  const targetOrigin = `http://${targetHost}:${options.target}`;
  const selfOrigin = `http://localhost:${options.listen}`;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/__lasso/")) {
      if (url.startsWith("/__lasso/client.js")) {
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(options.clientJs());
        return;
      }
      if (url.startsWith("/__lasso/feedback")) return void handleFeedbackRequest(req, res, options.inbox);
      res.writeHead(404).end();
      return;
    }
    const headers = { ...req.headers, "accept-encoding": "identity", "x-forwarded-host": req.headers.host ?? "" };
    const upstreamReq = http.request(
      { host: targetHost, port: options.target, method: req.method, path: url, headers },
      (upstream) => {
        const out = { ...upstream.headers };
        if (typeof out.location === "string" && out.location.startsWith(targetOrigin)) {
          out.location = selfOrigin + out.location.slice(targetOrigin.length);
        }
        const isHtml = String(out["content-type"] ?? "").includes("text/html") && req.method !== "HEAD";
        if (!isHtml) {
          res.writeHead(upstream.statusCode ?? 502, out);
          upstream.pipe(res);
          return;
        }
        delete out["content-length"];
        delete out["content-security-policy"];
        res.writeHead(upstream.statusCode ?? 502, out);
        inject(upstream, res);
      }
    );
    upstreamReq.on("error", (error) => {
      if (res.headersSent) return void res.destroy();
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Lasso: ${targetOrigin} \uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAC1C\uBC1C \uC11C\uBC84\uAC00 \uCF1C\uC838 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.
${error.message}`);
    });
    req.pipe(upstreamReq);
  });
  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(options.target, targetHost, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join("\r\n")}\r
\r
`);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      socket.destroy();
    };
    upstream.on("error", close);
    socket.on("error", close);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.listen, () => resolve(server));
  });
}

// src/cli.ts
var HELP = `Clevon Lasso \u2014 \uBCF4\uACE0 \uC788\uB294 \uD654\uBA74\uC5D0 \uBC14\uB85C \uD53C\uB4DC\uBC31\uC744 \uB0A8\uAE30\uACE0 Claude Code \uC138\uC158\uC774 \uBC1B\uC544 \uACE0\uCE5C\uB2E4.

\uC0AC\uC6A9\uBC95
  lasso <\uD3EC\uD2B8>            \uAC1C\uBC1C \uC11C\uBC84(<\uD3EC\uD2B8>) \uC55E\uC5D0 \uD53C\uB4DC\uBC31 \uB3C4\uAD6C\uB97C \uC5B9\uC740 \uC911\uACC4 \uC11C\uBC84\uB97C \uC5F0\uB2E4 (\uAE30\uBCF8 <\uD3EC\uD2B8>+100)
    --listen <\uD3EC\uD2B8>       \uC911\uACC4 \uC11C\uBC84 \uD3EC\uD2B8\uB97C \uC9C1\uC811 \uC815\uD55C\uB2E4
  lasso watch             \uC544\uC9C1 \uC548 \uB118\uAE34 \uD53C\uB4DC\uBC31\uBD80\uD130 \uD55C \uAC74\uC529 \uCD9C\uB825\uD558\uACE0 \uC0C8 \uD53C\uB4DC\uBC31\uC744 \uAE30\uB2E4\uB9B0\uB2E4
  lasso path              \uC774 \uD504\uB85C\uC81D\uD2B8\uC758 \uC218\uC2E0\uD568 \uD3F4\uB354\uB97C \uCD9C\uB825\uD55C\uB2E4

\uACF5\uD1B5
  --dir <\uD3F4\uB354>            \uC218\uC2E0\uD568 \uD3F4\uB354 (\uAE30\uBCF8: ~/.clevon-lasso/<\uD504\uB85C\uC81D\uD2B8\uC774\uB984>-<\uD574\uC2DC>)
  --project <\uD3F4\uB354>        \uC5B4\uB290 \uD504\uB85C\uC81D\uD2B8\uC758 \uC218\uC2E0\uD568\uC778\uC9C0 (\uAE30\uBCF8: \uD604\uC7AC \uD3F4\uB354)`;
var { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    listen: { type: "string" },
    dir: { type: "string" },
    project: { type: "string" },
    help: { type: "boolean", short: "h" }
  }
});
var inbox = createInbox(values.dir ? path2.resolve(values.dir) : defaultInboxDir(values.project));
var command = positionals[0];
async function watch() {
  const tick = async () => {
    for (const entry of await inbox.takeUnread()) process.stdout.write(`${formatEntry(entry)}
`);
  };
  await tick();
  setInterval(() => void tick().catch((error) => console.error(error)), 700);
}
async function proxy(target) {
  const listen = values.listen ? Number(values.listen) : target + 100;
  const here = path2.dirname(fileURLToPath(import.meta.url));
  const clientJs = () => readFileSync2(path2.join(here, "client.js"), "utf8");
  await startProxy({ target, listen, inbox, clientJs });
  console.log(`Lasso \uC911\uACC4 \uC11C\uBC84: http://localhost:${listen}  (\uC6D0\uB798 \uC11C\uBC84 http://localhost:${target})`);
  console.log(`\uC218\uC2E0\uD568: ${inbox.dir}`);
}
if (values.help || !command || command === "help") {
  console.log(HELP);
} else if (command === "path") {
  console.log(inbox.dir);
} else if (command === "watch") {
  await watch();
} else if (/^\d+$/.test(command)) {
  await proxy(Number(command));
} else {
  console.error(`\uC54C \uC218 \uC5C6\uB294 \uBA85\uB839: ${command}

${HELP}`);
  process.exit(1);
}
