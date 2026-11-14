// wix-backend/http-functions.js
import { response as response2 } from "wix-http-functions";
import wixData3 from "wix-data";

// wix-backend/walletService.js
import { randomBytes } from "crypto";
import wixSecretsBackend from "wix-secrets-backend";

// wix-backend/walletCore.js
var CONFIG = Object.freeze({
  collection: "WalletAcceptedReservations",
  logCollection: "WalletGenerationLog",
  // Provider currently documents 10/day in llms-full.txt; conservative ceiling.
  dailyLimit: 10,
  providerUrl: "https://walletmcppass.com/api/passes",
  lockMinutes: 3,
  maxQrLength: 500
});
var ERRORS = Object.freeze({
  NOT_FOUND: "No hemos encontrado ninguna entrada asociada a ese c\xF3digo QR.",
  INVALID: "Esta entrada no est\xE1 disponible para generar un pase.",
  LIMIT: "Servicio temporalmente no disponible. Hemos alcanzado el l\xEDmite de generaciones gratuitas. Int\xE9ntalo de nuevo ma\xF1ana. Gracias por tu paciencia.",
  BUSY: "Esta entrada ya se est\xE1 preparando. Int\xE9ntalo de nuevo en unos instantes.",
  GENERIC: "No hemos podido generar el pase. Vuelve a intentarlo m\xE1s tarde.",
  BAD_QR: "No hemos podido identificar un c\xF3digo QR v\xE1lido en la imagen."
});
function extractPassId(qr) {
  if (typeof qr !== "string" || !qr.trim() || qr.length > CONFIG.maxQrLength) return null;
  const raw = qr.trim();
  return raw;
}
function isValidRecord(r) {
  return !!r && r.source === "baztango-manager" && r.status === "valid" && !!r.qrValue && !!r.holderName;
}
function mapPass(r, contactEmail) {
  if (!isValidRecord(r)) throw new Error("INVALID");
  if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("CONTACT_EMAIL");
  const result = {
    style: "eventTicket",
    organization_name: String(r.organizationName || "BAZTANGO"),
    description: String(r.eventName || "BAZTANGO"),
    logo_text: String(r.organizationName || "BAZTANGO"),
    contact_email: contactEmail,
    x402_ready: false,
    barcode_message: String(r.qrValue),
    barcode_format: "QR",
    barcode_alt_text: String(r.passId || r.qrValue),
    background_color: String(r.backgroundColor || "#192a42"),
    foreground_color: String(r.foregroundColor || "#ffffff"),
    label_color: String(r.labelColor || "#cbd5e1"),
    primary_fields: [{ key: "holder", label: "TITULAR", value: String(r.holderName) }],
    secondary_fields: [
      { key: "passType", label: "MODALIDAD", value: String(r.passType || "Entrada") },
      { key: "date", label: "FECHAS", value: String(r.dateLabel || "") }
    ].filter((v) => v.value),
    auxiliary_fields: [
      { key: "venue", label: "LUGAR", value: String(r.venue || "") },
      { key: "session", label: "SESI\xD3N", value: String(r.sessionLabel || "") }
    ].filter((v) => v.value),
    back_fields: [
      { key: "event", label: "EVENTO", value: String(r.eventName || "") },
      { key: "entry", label: "IDENTIFICADOR", value: String(r.passId || r.qrValue) },
      { key: "instructions", label: "ACCESO", value: "Entrada personal. Presenta el QR en el acceso." }
    ].filter((v) => v.value)
  };
  if (r.relevantDate) result.relevant_date = new Date(r.relevantDate).toISOString();
  return result;
}
function limitDayUTC(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().slice(0, 10);
}
function validProviderUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && u.hostname === "walletmcppass.com" && /^\/download\//.test(u.pathname);
  } catch {
    return false;
  }
}
function isZip(buffer) {
  return buffer && buffer.length > 4 && buffer[0] === 80 && buffer[1] === 75 && buffer[2] === 3 && buffer[3] === 4;
}
function errorResult(code) {
  return { ok: false, code, message: ERRORS[code] || ERRORS.GENERIC };
}

// wix-backend/walletSyncCore.js
var PASS_FIELDS = Object.freeze([
  "source",
  "sourceEdition",
  "reservationId",
  "passId",
  "qrValue",
  "holderName",
  "eventName",
  "organizationName",
  "passType",
  "dateLabel",
  "sessionLabel",
  "venue",
  "relevantDate",
  "status",
  "backgroundColor",
  "foregroundColor",
  "labelColor"
]);
function validateItems(items, edition) {
  if (!/^20\d{2}$/.test(edition) || !Array.isArray(items) || items.length > 50) throw new Error("BAD_SYNC");
  const seen = /* @__PURE__ */ new Set();
  for (const r of items) {
    if (!r || Object.keys(r).some((k) => !PASS_FIELDS.includes(k)) || Object.values(r).some((v) => typeof v !== "string" || v.length > 1e3) || r.source !== "baztango-manager" || r.sourceEdition !== edition || r.status !== "valid" || !r.passId?.trim() || r.qrValue !== r.passId || r.qrValue.length > 500 || !r.holderName?.trim() || !r.reservationId?.trim() || !r.eventName?.trim() || seen.has(r.passId)) throw new Error("BAD_SYNC");
    if (r.relevantDate && !Number.isFinite(Date.parse(r.relevantDate))) throw new Error("BAD_SYNC");
    seen.add(r.passId);
  }
  return items;
}
function recordsMatch(a, b) {
  return PASS_FIELDS.every((k) => (a[k] || "") === (b[k] || ""));
}
function mergeRecord(previous, item, run) {
  const same = previous && recordsMatch(previous, item);
  const next = { ...previous, ...Object.fromEntries(PASS_FIELDS.map((k) => [k, item[k] || null])), syncRun: run, sourceSyncedAt: /* @__PURE__ */ new Date() };
  if (!same) Object.assign(next, {
    walletStatus: "pending",
    downloadToken: null,
    mediaFileUrl: null,
    providerUrl: null,
    providerExpiresAt: null,
    walletSerial: null,
    walletGeneratedAt: null,
    lockUntil: null
  });
  return next;
}

// wix-backend/walletRepository.js
import wixData from "wix-data";
import { createHash } from "crypto";
var o = { suppressAuth: true, consistentRead: true };
async function findByQr(qr) {
  const r = await wixData.query(CONFIG.collection).eq("qrValue", qr).limit(2).find(o);
  return r.items.length === 1 ? r.items[0] : null;
}
async function getById(id) {
  return wixData.get(CONFIG.collection, id, o);
}
async function save(record) {
  return wixData.update(CONFIG.collection, record, o);
}
var generationId = (id) => "gen-" + createHash("sha256").update(id).digest("hex").slice(0, 32);
async function acquireGeneration(id, owner) {
  const key = generationId(id);
  try {
    await wixData.insert(CONFIG.logCollection, { _id: key, result: "lock", owner, createdAt: /* @__PURE__ */ new Date() }, o);
    return true;
  } catch (error) {
    if (await wixData.get(CONFIG.logCollection, key, o)) return false;
    throw error;
  }
}
async function releaseGeneration(id, owner) {
  const key = generationId(id), lock = await wixData.get(CONFIG.logCollection, key, o);
  if (lock?.owner === owner) await wixData.remove(CONFIG.logCollection, key, o);
}
async function reserveQuota(day) {
  for (let slot = 0; slot < CONFIG.dailyLimit; slot++) {
    const key = `quota-${day}-${slot}`;
    try {
      await wixData.insert(CONFIG.logCollection, { _id: key, result: "reserved", utcDay: day, createdAt: /* @__PURE__ */ new Date() }, o);
      return true;
    } catch (error) {
      if (!await wixData.get(CONFIG.logCollection, key, o)) throw error;
    }
  }
  return false;
}
async function logResult(result, passId, day) {
  await wixData.insert(CONFIG.logCollection, { result, passId, utcDay: day, createdAt: /* @__PURE__ */ new Date() }, o);
}

// wix-backend/walletProvider.js
import { fetch } from "wix-fetch";

// wix-backend/walletBinary.js
import { get } from "node:https";
var MAX_BYTES = 10 * 1024 * 1024;
function allowedBinaryUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && (u.hostname === "walletmcppass.com" && u.pathname.startsWith("/download/") || u.hostname.endsWith(".wixstatic.com") || u.hostname.endsWith(".filesusr.com"));
  } catch {
    return false;
  }
}
async function readBinary(url, redirects = 0) {
  if (!allowedBinaryUrl(url) || redirects > 3) throw new Error("BINARY_URL");
  return new Promise((resolve, reject) => {
    const request = get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = new URL(res.headers.location || "", url).href;
        readBinary(next, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 || Number(res.headers["content-length"]) > MAX_BYTES) {
        res.resume();
        reject(new Error("BINARY_HTTP"));
        return;
      }
      let length = 0;
      const chunks = [];
      res.on("data", (chunk) => {
        length += chunk.length;
        if (length > MAX_BYTES) {
          request.destroy(new Error("BINARY_SIZE"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("BINARY_ABORTED")));
    });
    request.setTimeout(15e3, () => request.destroy(new Error("BINARY_TIMEOUT")));
    request.on("error", reject);
  });
}

// wix-backend/walletProvider.js
async function createPass(payload) {
  const res = await fetch(CONFIG.providerUrl, { method: "post", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (res.status === 402 || res.status === 429) return { code: "LIMIT" };
  if (!res.ok) {
    console.error("wallet provider error status", res.status);
    return { code: "GENERIC" };
  }
  const json2 = await res.json();
  if (!validProviderUrl(json2.download_url)) return { code: "GENERIC" };
  const lifetime = Number(json2.expires_in_seconds || 3600);
  if (!Number.isFinite(lifetime) || lifetime <= 0) return { code: "GENERIC" };
  return { code: "OK", url: json2.download_url, serial: json2.serial_number, expiresAt: new Date(Date.now() + Math.min(lifetime, 3600) * 1e3).toISOString() };
}
async function fetchPass(url) {
  if (!validProviderUrl(url)) throw new Error("Invalid provider URL");
  const buf = await readBinary(url);
  if (!isZip(buf) || buf.length > 10 * 1024 * 1024) throw new Error("Not a valid small ZIP pkpass");
  return buf;
}

// wix-backend/walletStorage.js
import { mediaManager } from "wix-media-backend";
async function persistPass(providerUrl, record) {
  const buffer = await fetchPass(providerUrl);
  try {
    const file = await mediaManager.upload("/wallet-passes", buffer, `pass-${record._id}.pkpass`, {
      mediaOptions: { mimeType: "application/vnd.apple.pkpass", mediaType: "document" },
      metadataOptions: { isPrivate: true, isVisitorUpload: false }
    });
    return { mediaFileUrl: file.fileUrl, bytes: buffer.length };
  } catch (e) {
    console.error("Wix media storage unavailable for pkpass");
    return { mediaFileUrl: "", bytes: buffer.length };
  }
}
async function downloadStored(mediaFileUrl) {
  const url = await mediaManager.getDownloadUrl(mediaFileUrl);
  return readBinary(url);
}

// wix-backend/walletService.js
function cached(r) {
  return r.walletStatus === "generated" && /^[a-f0-9]{64}$/.test(r.downloadToken || "") && (r.mediaFileUrl || r.providerUrl && new Date(r.providerExpiresAt).getTime() > Date.now() + 6e4);
}
function ready(r) {
  return {
    ok: true,
    state: "ready",
    downloadPath: `/_functions/walletDownload?token=${r.downloadToken}`,
    stored: !!r.mediaFileUrl,
    expiresAt: r.mediaFileUrl ? null : r.providerExpiresAt
  };
}
async function generateFromQr(rawQr) {
  const qr = extractPassId(rawQr);
  if (!qr) return errorResult("BAD_QR");
  let r, owner, locked = false;
  try {
    r = await findByQr(qr);
    if (!r) return errorResult("NOT_FOUND");
    if (!isValidRecord(r)) return errorResult("INVALID");
    if (cached(r)) return ready(r);
    owner = randomBytes(16).toString("hex");
    locked = await acquireGeneration(r._id, owner);
    if (!locked) return errorResult("BUSY");
    r = await getById(r._id);
    if (!isValidRecord(r)) return errorResult("INVALID");
    if (cached(r)) return ready(r);
    const contact = await wixSecretsBackend.getSecret("WALLET_CONTACT_EMAIL");
    const payload = mapPass(r, contact);
    const day = limitDayUTC();
    if (!await reserveQuota(day)) return errorResult("LIMIT");
    const result = await createPass(payload);
    if (result.code !== "OK") return errorResult(result.code);
    const stored = await persistPass(result.url, r);
    const current = await getById(r._id);
    if (!isValidRecord(current) || !recordsMatch(r, current)) return errorResult("INVALID");
    const next = {
      ...current,
      walletStatus: "generated",
      walletSerial: result.serial,
      providerUrl: result.url,
      providerExpiresAt: new Date(result.expiresAt),
      mediaFileUrl: stored.mediaFileUrl,
      walletGeneratedAt: /* @__PURE__ */ new Date(),
      downloadToken: randomBytes(32).toString("hex")
    };
    await save(next);
    await logResult("created", r.passId, day);
    return ready(next);
  } catch (_error) {
    console.error("wallet generation failed");
    return errorResult("GENERIC");
  } finally {
    if (locked) try {
      await releaseGeneration(r._id, owner);
    } catch {
      console.error("wallet lock release failed");
    }
  }
}

// wix-backend/walletSync.js
import wixData2 from "wix-data";
import { createHash as createHash2, timingSafeEqual } from "crypto";
import wixSecretsBackend2 from "wix-secrets-backend";
import { response } from "wix-http-functions";

// wix-backend/walletCollections.js
import { collections } from "wix-data.v2";
import { elevate } from "wix-auth";
var text = (keys) => keys.split(" ").map((key) => ({ key, displayName: key, type: "TEXT" }));
var dates = (keys) => keys.split(" ").map((key) => ({ key, displayName: key, type: "DATETIME" }));
var permissions = { read: "ADMIN", insert: "ADMIN", update: "ADMIN", remove: "ADMIN" };
var COLLECTION_SCHEMAS = [
  { _id: "WalletAcceptedReservations", displayName: "WalletAcceptedReservations", permissions, fields: [
    ...text("source sourceEdition reservationId passId qrValue holderName eventName organizationName passType dateLabel sessionLabel venue status backgroundColor foregroundColor labelColor walletStatus walletSerial providerUrl mediaFileUrl downloadToken syncRun"),
    ...dates("relevantDate providerExpiresAt lockUntil walletGeneratedAt sourceSyncedAt")
  ] },
  { _id: "WalletGenerationLog", displayName: "WalletGenerationLog", permissions, fields: [
    ...text("result passId utcDay owner snapshotId"),
    ...dates("createdAt lockUntil"),
    { key: "expectedCount", displayName: "expectedCount", type: "NUMBER" }
  ] }
];
async function prepareCollections() {
  const list = await elevate(collections.listDataCollections)({ paging: { limit: 1e3 } });
  const present = new Set((list.collections || []).map((c) => c._id));
  for (const schema of COLLECTION_SCHEMAS) {
    if (!present.has(schema._id)) {
      await elevate(collections.createDataCollection)(schema);
      continue;
    }
    const current = await elevate(collections.getDataCollection)(schema._id);
    const fields = new Map(current.fields.map((f) => [f.key, f]));
    for (const f of schema.fields) {
      if (fields.has(f.key) && fields.get(f.key).type !== f.type) throw new Error("FIELD_TYPE_MISMATCH");
      if (!fields.has(f.key)) fields.set(f.key, f);
    }
    await elevate(collections.updateDataCollection)({ ...current, fields: [...fields.values()], permissions });
  }
  return COLLECTION_SCHEMAS.map((s) => s._id);
}

// wix-backend/walletSync.js
var options = { suppressAuth: true, suppressHooks: true, consistentRead: true };
var reply = (status, data) => response({ status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(data) });
var stableId = (edition, id) => createHash2("sha256").update(JSON.stringify([edition, id])).digest("hex").slice(0, 32);
function equal(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function syncRequest(request) {
  let stage = "authorization";
  try {
    const supplied = /^Bearer (.+)$/i.exec(request.headers?.authorization || request.headers?.Authorization || "")?.[1] || "";
    const expected = await wixSecretsBackend2.getSecret("baztango-reservations-export-token");
    if (!supplied || !expected || !equal(supplied, expected)) return reply(403, { ok: false });
    stage = "body";
    const body = await request.body.json();
    if (!body || JSON.stringify(body).length > 75e4) return reply(413, { ok: false });
    const { edition, snapshotId, action } = body;
    if (!/^20\d{2}$/.test(edition) || !/^[a-f0-9]{64}$/.test(snapshotId)) return reply(400, { ok: false });
    if (action === "prepare") {
      stage = "prepare";
      return reply(200, { ok: true, collections: await prepareCollections() });
    }
    stage = "lock";
    const lockId = "sync-" + edition;
    let lock = await wixData2.get(CONFIG.logCollection, lockId, options);
    if (action === "begin") {
      if (!Number.isInteger(body.count) || body.count < 0 || body.count > 5e3) return reply(400, { ok: false });
      if (lock && lock.snapshotId !== snapshotId && new Date(lock.lockUntil).getTime() > Date.now()) return reply(409, { ok: false });
      const next = { _id: lockId, snapshotId, expectedCount: body.count, lockUntil: new Date(Date.now() + 15 * 6e4), result: "sync", utcDay: "" };
      if (lock) await wixData2.update(CONFIG.logCollection, next, options);
      else await wixData2.insert(CONFIG.logCollection, next, options);
      return reply(200, { ok: true });
    }
    if (!lock || lock.snapshotId !== snapshotId || new Date(lock.lockUntil).getTime() < Date.now()) return reply(409, { ok: false });
    if (action === "upsert") {
      const items = validateItems(body.items, edition);
      for (const item of items) {
        const id = stableId(edition, item.passId);
        if (!await acquireGeneration(id, snapshotId)) return reply(409, { ok: false });
        try {
          const previous = await wixData2.get(CONFIG.collection, id, options);
          const record = { ...mergeRecord(previous, item, snapshotId), _id: id };
          if (previous) await wixData2.update(CONFIG.collection, record, options);
          else await wixData2.insert(CONFIG.collection, record, options);
        } finally {
          await releaseGeneration(id, snapshotId);
        }
      }
      return reply(200, { ok: true, count: items.length });
    }
    if (action === "finish") {
      const ids = body.passIds;
      if (!Array.isArray(ids) || ids.length !== lock.expectedCount || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id || id.length > 500)) return reply(400, { ok: false });
      const current = [];
      let page = await wixData2.query(CONFIG.collection).eq("source", "baztango-manager").eq("sourceEdition", edition).limit(1e3).find(options);
      current.push(...page.items);
      while (page.hasNext()) {
        page = await page.next();
        current.push(...page.items);
      }
      const expectedIds = new Set(ids);
      const applied = new Set(current.filter((r) => r.syncRun === snapshotId && r.status === "valid").map((r) => r.passId));
      if (ids.some((id) => !applied.has(id))) return reply(409, { ok: false });
      let revoked = 0;
      for (const r of current) {
        if (!expectedIds.has(r.passId) && r.status !== "cancelled") {
          if (!await acquireGeneration(r._id, snapshotId)) return reply(409, { ok: false });
          try {
            const fresh = await wixData2.get(CONFIG.collection, r._id, options);
            await wixData2.update(CONFIG.collection, {
              ...fresh,
              status: "cancelled",
              walletStatus: "pending",
              downloadToken: null,
              mediaFileUrl: null,
              providerUrl: null,
              providerExpiresAt: null,
              lockUntil: null
            }, options);
          } finally {
            await releaseGeneration(r._id, snapshotId);
          }
          revoked++;
        }
      }
      await wixData2.update(CONFIG.logCollection, { ...lock, result: "synced", lockUntil: new Date(Date.now() + 6e4) }, options);
      return reply(200, { ok: true, active: ids.length, revoked });
    }
    return reply(400, { ok: false });
  } catch (error) {
    console.error("walletSync failed at " + stage + ": " + String(error?.message || error));
    return reply(500, { ok: false, code: "SYNC_FAILED", stage });
  }
}

// wix-backend/http-functions.js
var ALLOWED_ORIGIN = "https://baztangoinfo.github.io";
var headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
  "Cache-Control": "no-store"
};
function json(status, obj) {
  return response2({ status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(obj) });
}
function originAllowed(request) {
  return request.headers?.origin === ALLOWED_ORIGIN;
}
function options_walletGenerate(request) {
  if (!originAllowed(request)) return response2({ status: 403, headers: { "Vary": "Origin" }, body: "" });
  return response2({ status: 204, headers: { ...headers, "Access-Control-Max-Age": "600" }, body: "" });
}
var post_walletSync = syncRequest;
async function post_walletGenerate(request) {
  if (!originAllowed(request)) return json(403, { ok: false, code: "ORIGIN", message: "Origen no autorizado." });
  try {
    const body = await request.body.json();
    if (!body || typeof body.qr !== "string" || body.qr.length > 500) return json(400, { ok: false, code: "BAD_QR", message: "QR inv\xE1lido." });
    const r = await generateFromQr(body.qr);
    if (r.ok) {
      const BASE = "https://www.joseba-bakartxo.com";
      return json(200, { ok: true, downloadUrl: BASE + r.downloadPath, stored: r.stored, expiresAt: r.expiresAt || null });
    }
    return json(r.code === "LIMIT" ? 429 : r.code === "NOT_FOUND" ? 404 : r.code === "BUSY" ? 409 : 400, r);
  } catch (err) {
    console.error("walletGenerate failed");
    return json(500, { ok: false, code: "GENERIC", message: "No se pudo generar la entrada." });
  }
}
async function get_walletDownload(request) {
  const token = String(request.query?.token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) return response2({ status: 400, body: "Enlace inv\xE1lido" });
  const found = await wixData3.query(CONFIG.collection).eq("downloadToken", token).limit(1).find({ suppressAuth: true, consistentRead: true });
  const pass = found.items[0];
  if (!isValidRecord(pass) || pass.walletStatus !== "generated") return response2({ status: 404, body: "Pase no disponible" });
  try {
    let bytes;
    if (pass.mediaFileUrl) bytes = await downloadStored(pass.mediaFileUrl);
    else if (pass.providerUrl && new Date(pass.providerExpiresAt).getTime() > Date.now()) bytes = await fetchPass(pass.providerUrl);
    else return response2({ status: 410, body: "El pase ha caducado. Solicita su regeneraci\xF3n." });
    if (!isZip(bytes)) throw new Error("Invalid pkpass zip");
    const current = await wixData3.get(CONFIG.collection, pass._id, { suppressAuth: true, consistentRead: true });
    if (!isValidRecord(current) || current.downloadToken !== token) return response2({ status: 410, body: "El pase ha cambiado. Solicita uno actualizado." });
    return response2({ status: 200, headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": 'inline; filename="entrada-baztango.pkpass"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }, body: bytes });
  } catch (err) {
    console.error("walletDownload failed");
    return response2({ status: 500, body: "No se pudo preparar el archivo" });
  }
}
export {
  get_walletDownload,
  options_walletGenerate,
  post_walletGenerate,
  post_walletSync
};
