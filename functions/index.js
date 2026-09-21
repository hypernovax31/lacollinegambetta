const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

admin.initializeApp();
const db = getFirestore();

const policyPromise = import('./reservation-policy.mjs');

class CapacityFullError extends Error {
  constructor(capacity) {
    super('Ce créneau est complet.');
    this.code = 'CAPACITY_FULL';
    this.capacity = capacity;
  }
}

function text(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function iframeResponse(res, payload) {
  const message = JSON.stringify({ source: 'lcg-reservation-capacity', payload })
    .replaceAll('<', '\\u003c');
  res.status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'")
    .send(`<!doctype html><meta charset="utf-8"><script>window.parent.postMessage(${message}, "*");</script>`);
}

function jsonResponse(res, status, payload) {
  res.status(status).set('Cache-Control', 'no-store').json(payload);
}

function dataFromRequest(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function reservationRef(id) {
  return db.collection('reservations').doc(id);
}

function capacityRef(date) {
  return db.collection('capacity').doc(date);
}

function ledgerRows(snapshot) {
  if (!snapshot.exists) return [];
  const data = snapshot.data() || {};
  return Array.isArray(data.reservations) ? data.reservations : [];
}

async function availability(date, requestedTime, requestedGuests, policy) {
  const snapshot = await capacityRef(date).get();
  const rows = ledgerRows(snapshot).filter((row) => policy.activeStatuses.includes(String(row.status).toUpperCase()));
  const parsedTime = requestedTime ? policy.parseTime(requestedTime) : null;
  if (requestedTime && (!parsedTime || !policy.slots().some((slot) => slot.minutes === parsedTime.minutes))) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Heure invalide.' };
  }

  const guests = Number.isInteger(Number(requestedGuests)) && Number(requestedGuests) > 0
    ? Number(requestedGuests)
    : 1;
  const generatedSlots = policy.slots().map((slot) => {
    const capacity = policy.evaluateCapacity(rows, { startMinutes: slot.minutes, guests });
    return {
      value: slot.value,
      label: slot.label,
      available: capacity.available,
      remainingReservations: capacity.remainingReservations,
      remainingCovers: capacity.remainingCovers
    };
  });

  return {
    ok: true,
    date,
    durationMinutes: policy.POLICY.durationMinutes,
    maxReservations: policy.POLICY.maxReservations,
    maxCovers: policy.POLICY.maxCovers,
    slots: generatedSlots,
    selected: parsedTime ? generatedSlots.find((slot) => slot.value === requestedTime) : null
  };
}

async function reserve(data, policy) {
  const candidate = policy.validateReservation({
    date: data.date,
    time: data.heure || data.time,
    guests: data.couverts || data.guests,
    now: policy.parisNow()
  });
  if (!candidate.ok) return candidate;

  const fields = {
    name: text(data.nom || data.Nom, 120),
    phone: text(data.telephone || data.Téléphone, 80),
    email: text(data.email || data.Mail, 200),
    preference: text(data.preference || data.Préférence, 120),
    message: text(data.message || data.Message, 2000)
  };
  if (!fields.name || !fields.phone) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Le nom et le téléphone sont obligatoires.' };
  }

  const ledger = capacityRef(candidate.date);
  const reservation = db.collection('reservations').doc();
  let accepted;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ledger);
    const rows = ledgerRows(snapshot);
    const capacity = policy.evaluateCapacity(rows, candidate);
    if (!capacity.available) throw new CapacityFullError(capacity);

    const ledgerReservation = {
      id: reservation.id,
      startMinutes: candidate.startMinutes,
      time: candidate.time,
      guests: candidate.guests,
      status: 'PENDING'
    };
    const updatedRows = rows.concat(ledgerReservation);
    transaction.set(reservation, {
      ...candidate,
      ...fields,
      status: 'PENDING',
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(ledger, {
      date: candidate.date,
      reservations: updatedRows,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    accepted = { capacity, id: reservation.id };
  });

  return {
    ok: true,
    code: 'ACCEPTED',
    id: accepted.id,
    ...accepted.capacity,
    notification: 'La demande est enregistrée.'
  };
}

exports.reservationApi = onRequest({
  region: 'europe-west1',
  cors: true,
  maxInstances: 1
}, async (req, res) => {
  const policy = await policyPromise;
  try {
    if (req.method === 'GET') {
      const date = policy.parseDate(req.query.date);
      if (!date) return jsonResponse(res, 400, { ok: false, code: 'INVALID_INPUT', message: 'Date invalide.' });
      return jsonResponse(res, 200, await availability(
        date,
        req.query.time,
        req.query.couverts,
        policy
      ));
    }

    if (req.method !== 'POST') {
      res.set('Allow', 'GET, POST');
      return res.status(405).send('Method Not Allowed');
    }

    const result = await reserve(dataFromRequest(req), policy);
    return iframeResponse(res, result);
  } catch (error) {
    if (error instanceof CapacityFullError) {
      return iframeResponse(res, {
        ok: false,
        code: error.code,
        message: error.message,
        ...error.capacity
      });
    }
    logger.error('Reservation API error', error);
    return iframeResponse(res, {
      ok: false,
      code: 'SERVER_ERROR',
      message: 'La réservation n’a pas pu être enregistrée.'
    });
  }
});
