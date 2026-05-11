export function createVercelHandler(fetchHandler) {
  return async function handler(req, res) {
    try {
      const request = toFetchRequest(req);
      const response = await fetchHandler(request);
      await sendResponse(res, response);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: error.message || "Server error" }));
    }
  };
}

function toFetchRequest(req) {
  const host = req.headers?.host || "localhost";
  const protocol = req.headers?.["x-forwarded-proto"] || "https";
  const url = new URL(req.url || "/", `${protocol}://${host}`);
  const method = req.method || "GET";
  const body = bodyForRequest(req, method);

  return new Request(url, {
    method,
    headers: req.headers,
    body,
    duplex: body ? "half" : undefined
  });
}

function bodyForRequest(req, method) {
  if (["GET", "HEAD"].includes(method)) return undefined;
  if (req.body == null) return undefined;
  if (Buffer.isBuffer(req.body) || typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}
