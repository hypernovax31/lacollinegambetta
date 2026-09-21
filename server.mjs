import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  RESERVATION_POLICY,
  evaluateCapacity,
  parisNow,
  parseDate,
  parseTime,
  slots,
  validateReservation
} from './server/reservation-policy.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const databasePath = resolve(process.env.RESERVATION_DB || join(ROOT, 'data', 'reservations.sqlite'));
await mkdir(resolve(databasePath, '..'), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    date TEXT NOT NULL,
    start_minutes INTEGER NOT NULL,
    guests INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    preference TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS reservations_date_idx
    ON reservations (date, start_minutes, status);
`);

const selectActive = db.prepare(`
  SELECT start_minutes AS startMinutes, guests, status
  FROM reservations
  WHERE date = ? AND status IN ('PENDING', 'CONFIRMED')
`);
const insertReservation = db.prepare(`
  INSERT INTO reservations
    (date, start_minutes, guests, status, name, phone, email, preference, message)
  VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
`);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

/* La page envoie le formulaire dans une iframe cachée. Cette réponse HTML
   évite d'avoir à activer CORS et transmet le résultat à la page appelante. */
function sendCapacityMessage(response, value) {
  const payload = JSON.stringify({ source: 'lcg-reservation-capacity', payload: value })
    .replaceAll('<', '\\u003c');
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'"
  });
  response.end(`<!doctype html><meta charset="utf-8"><script>window.parent.postMessage(${payload}, "*");</script>`);
}

async function bodyParameters(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) return {};
  const contentType = String(request.headers['content-type'] || '');
  if (contentType.includes('application/json')) {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function activeRows(date) {
  return selectActive.all(date).map((row) => ({
    startMinutes: Number(row.startMinutes),
    guests: Number(row.guests),
    status: row.status
  }));
}

function reservationResponse(request, response, result) {
  if (request.method === 'POST') sendCapacityMessage(response, result);
  else sendJson(response, result.ok === false ? 400 : 200, result);
}

async function handleReservations(request, response, url) {
  if (request.method === 'GET') {
    const date = parseDate(url.searchParams.get('date'));
    const requestedTime = url.searchParams.get('time');
    if (!date) return sendJson(response, 400, { ok: false, code: 'INVALID_INPUT', message: 'Date invalide.' });

    const parsedTime = requestedTime ? parseTime(requestedTime) : null;
    if (requestedTime && (!parsedTime || !slots().some((slot) => slot.minutes === parsedTime.minutes))) {
      return sendJson(response, 400, { ok: false, code: 'INVALID_INPUT', message: 'Heure invalide.' });
    }

    const rows = activeRows(date);
    const guestCount = Number(url.searchParams.get('couverts') || 1);
    const generatedSlots = slots().map((slot) => {
      const capacity = evaluateCapacity(rows, {
        startMinutes: slot.minutes,
        guests: Number.isInteger(guestCount) && guestCount > 0 ? guestCount : 1
      });
      return {
        value: slot.value,
        label: slot.label,
        available: capacity.available,
        remainingReservations: capacity.remainingReservations,
        remainingCovers: capacity.remainingCovers
      };
    });
    const selected = parsedTime
      ? generatedSlots.find((slot) => slot.value === requestedTime)
      : null;
    return sendJson(response, 200, {
      ok: true,
      date,
      durationMinutes: RESERVATION_POLICY.durationMinutes,
      maxReservations: RESERVATION_POLICY.maxReservations,
      maxCovers: RESERVATION_POLICY.maxCovers,
      slots: generatedSlots,
      selected
    });
  }

  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'GET, POST' });
    return response.end();
  }

  const data = await bodyParameters(request);
  const candidate = validateReservation({
    date: data.date,
    time: data.heure || data.time,
    guests: data.couverts || data.guests,
    now: parisNow()
  });
  if (!candidate.ok) return reservationResponse(request, response, candidate);

  const fields = {
    name: text(data.nom || data.Nom, 120),
    phone: text(data.telephone || data.Téléphone, 80),
    email: text(data.email || data.Mail, 200),
    preference: text(data.preference || data.Préférence, 120),
    message: text(data.message || data.Message, 2000)
  };
  if (!fields.name || !fields.phone) {
    return reservationResponse(request, response, {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Le nom et le téléphone sont obligatoires.'
    });
  }

  /* SQLite sérialise les transactions d'écriture : la lecture de capacité et
     l'insertion sont indissociables, même pour deux clients simultanés. */
  db.exec('BEGIN IMMEDIATE');
  try {
    const capacity = evaluateCapacity(activeRows(candidate.date), candidate);
    if (!capacity.available) {
      db.exec('COMMIT');
      return reservationResponse(request, response, {
        ok: false,
        code: 'CAPACITY_FULL',
        message: 'Ce créneau est complet.',
        ...capacity
      });
    }

    const result = insertReservation.run(
      candidate.date,
      candidate.startMinutes,
      candidate.guests,
      fields.name,
      fields.phone,
      fields.email,
      fields.preference,
      fields.message
    );
    db.exec('COMMIT');
    return reservationResponse(request, response, {
      ok: true,
      code: 'ACCEPTED',
      id: Number(result.lastInsertRowid),
      ...capacity,
      notification: 'La demande est enregistrée.'
    });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error(error);
    return reservationResponse(request, response, {
      ok: false,
      code: 'SERVER_ERROR',
      message: 'La réservation n’a pas pu être enregistrée.'
    });
  }
}

async function serveStatic(request, response, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(`${ROOT}${sep}`) && filePath !== ROOT) {
    return sendJson(response, 403, { ok: false, message: 'Forbidden' });
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': pathname.includes('reservation-config.js') ? 'no-store' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') return sendJson(response, 404, { ok: false, message: 'Not found' });
    sendJson(response, 500, { ok: false, message: 'Unable to read file' });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/reservations') {
      return await handleReservations(request, response, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end();
    }
    return await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { ok: false, message: 'Erreur interne.' });
    else response.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`La Colline Gambetta : http://${HOST}:${PORT}`);
  console.log(`Réservations : fenêtre glissante de ${RESERVATION_POLICY.durationMinutes} min, ` +
    `${RESERVATION_POLICY.maxReservations} réservations / ${RESERVATION_POLICY.maxCovers} couverts`);
  console.log(`Base locale : ${databasePath}`);
});

function shutdown() {
  db.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
