const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Pool } = require("pg");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const accessKey = process.env.GIAPHA_KEY || "";
const dataFile = process.env.GIAPHA_DATA || path.join(root, "data", "giapha.json");
const databaseUrl = process.env.DATABASE_URL || "";
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : { rejectUnauthorized: false },
      max: 3,
    })
  : null;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function canEdit(req) {
  if (!accessKey) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return !!token && safeEqual(token, accessKey);
}

async function initStore() {
  if (!pool) return;
  await pool.query("CREATE TABLE IF NOT EXISTS giapha_state (id integer PRIMARY KEY, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
}

async function readStored() {
  if (pool) {
    const result = await pool.query("SELECT document FROM giapha_state WHERE id = 1");
    return result.rows.length ? result.rows[0].document : null;
  }
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return null;
  }
}

async function writeStored(state) {
  if (pool) {
    await pool.query("INSERT INTO giapha_state (id, document, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()", [JSON.stringify(state)]);
    return;
  }
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temporary = dataFile + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(state));
  try { fs.unlinkSync(dataFile); } catch { /* Lần ghi đầu chưa có file. */ }
  fs.renameSync(temporary, dataFile);
}

function validState(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.families)) return false;
  if (value.families.length < 1 || value.families.length > 200) return false;
  return value.families.every((family) => {
    if (!family || typeof family.id !== "string" || family.id.length >= 80 || typeof family.name !== "string" || !Array.isArray(family.people) || family.people.length > 5000) return false;
    if (family.intro != null && (typeof family.intro !== "string" || family.intro.length > 200000)) return false;
    if (family.photos == null) return true;
    if (!Array.isArray(family.photos) || family.photos.length > 24) return false;
    return family.photos.every((photo) => photo && typeof photo.id === "string" && photo.id.length < 40 && typeof photo.title === "string" && photo.title.length <= 120 && typeof photo.src === "string" && photo.src.startsWith("data:image/jpeg;base64,") && photo.src.length < 400000);
  });
}

function publicState(state) {
  const families = (state.families || []).filter((family) => family.isPublic);
  const currentId = families.some((family) => family.id === state.currentId) ? state.currentId : (families[0] ? families[0].id : null);
  return { version: state.version || 1, currentId, families };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 14_000_000) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveFile(res, relative) {
  if (!relative || relative.startsWith(".") || relative === "server.js" || relative.startsWith("data/") || relative.startsWith("data\\")) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const file = path.resolve(root, relative);
  const fromRoot = path.relative(root, file);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const headers = { "Content-Type": types[path.extname(file)] || "application/octet-stream" };
    const ext = path.extname(file);
    if (ext === ".html" || ext === ".js" || ext === ".css") headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, store: pool ? "postgres" : "file" });
      return;
    }
    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (accessKey && !safeEqual(body.key || "", accessKey)) {
        sendJson(res, 401, { error: "Sai mật khẩu" });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/state" && req.method === "GET") {
      const stored = await readStored();
      const editor = canEdit(req);
      if (!stored) {
        sendJson(res, 200, { empty: true, auth: !!accessKey, mode: editor ? "edit" : "view", state: null });
        return;
      }
      sendJson(res, 200, {
        empty: false,
        auth: !!accessKey,
        mode: editor ? "edit" : "view",
        state: editor ? stored : publicState(stored),
      });
      return;
    }
    if (url.pathname === "/api/state" && req.method === "PUT") {
      if (!canEdit(req)) {
        sendJson(res, 401, { error: "Cần mật khẩu" });
        return;
      }
      const next = JSON.parse(await readBody(req) || "");
      if (!validState(next)) {
        sendJson(res, 400, { error: "Dữ liệu không hợp lệ" });
        return;
      }
      await writeStored({ version: 1, currentId: next.currentId || next.families[0].id, families: next.families });
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Không hỗ trợ" });
      return;
    }
    const relative = decodeURIComponent(url.pathname) === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
    serveFile(res, relative);
  } catch {
    if (!res.headersSent) sendJson(res, 400, { error: "Yêu cầu không đọc được" });
  }
});

initStore()
  .then(() => {
    server.listen(port, () => {
      console.log("Phả đồ đang chạy tại http://localhost:" + port);
      console.log(pool ? "Dữ liệu lưu trên Postgres." : "Dữ liệu lưu trong file " + dataFile);
      if (!accessKey) console.log("Chưa đặt GIAPHA_KEY — ai mở được trang đều sửa được dữ liệu.");
    });
  })
  .catch((error) => {
    console.error("Không kết nối được cơ sở dữ liệu:", error.message);
    process.exit(1);
  });
