#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import createJobHandler from "./netlify/functions/create-job.mjs";
import getJobHandler from "./netlify/functions/get-job.mjs";
import documentHandler from "./netlify/functions/document.mjs";
import feedbackHandler from "./netlify/functions/feedback.mjs";
import selectDirectionHandler from "./netlify/functions/select-direction.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PUBLIC_DIR = resolve(ROOT, "public");
const port = Number(process.env.PORT || 8888);

const routes = new Map([
  ["/api/jobs", createJobHandler],
  ["/api/jobs/status", getJobHandler],
  ["/api/jobs/document", documentHandler],
  ["/api/jobs/feedback", feedbackHandler],
  ["/api/jobs/select-direction", selectDirectionHandler]
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);
    const routeHandler = routes.get(url.pathname);

    if (routeHandler) {
      const request = await toFetchRequest(req, url);
      const response = await routeHandler(request);
      await sendFetchResponse(res, response);
      return;
    }

    const filePath = resolveStaticPath(url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message || "Server error");
  }
}).listen(port, () => {
  console.log(`StudioNow web dev server running at http://localhost:${port}`);
});

async function toFetchRequest(req, url) {
  const body = await readBody(req);
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: body.length > 0 && !["GET", "HEAD"].includes(req.method || "GET") ? body : undefined,
    duplex: "half"
  });
}

async function sendFetchResponse(res, response) {
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function resolveStaticPath(pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, target));
  if (!filePath.startsWith(PUBLIC_DIR)) return null;
  return filePath;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
