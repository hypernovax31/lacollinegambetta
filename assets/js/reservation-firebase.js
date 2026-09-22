/* Réservations La Colline — Firebase Spark / Firestore
 *
 * Système de limitation et de gestion de capacité en temps réel :
 * - Limitation stricte par plage glissante de 60 minutes
 * - Paramètres de limitation configurables via Firestore (reservationSettings/config)
 * - Transactions atomiques pour éviter toute surréservation
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = window.LCG_FIREBASE_CONFIG;
if (!firebaseConfig || firebaseConfig.projectId !== 'la-colline-gambetta') {
  throw new Error('Configuration Firebase La Colline absente ou incorrecte.');
}

const app = initializeApp(firebaseConfig, 'lacolline-gambetta-reservations');
const auth = getAuth(app);
const db = getFirestore(app);

if (window.LCG_USE_EMULATORS === true || (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.LCG_USE_EMULATORS !== false)) {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch (emuErr) {
    console.warn('[Firebase emulator init]', emuErr);
  }
}

const authReady = signInAnonymously(auth);
authReady.catch((error) => console.error('[réservation Firebase]', error));

/* Valeurs par défaut du système de limitation */
const DEFAULT_POLICY = Object.freeze({
  firstSlotMinutes: 12 * 60,       // 12h00
  lastSlotMinutes: 22 * 60 + 45,   // 22h45
  stepMinutes: 15,                 // Créneaux de 15 min
  durationMinutes: 60,             // Plage glissante d'une heure
  adultsPerTable: 2,               // 1-2 pers = 1 table, 3-4 = 2 tables, etc.
  maxTables: 15,                   // Maximum 15 tables simultanées
  maxCovers: 30,                   // Maximum 30 personnes simultanées
  minNoticeMinutes: 15,            // Délai minimum avant le créneau (le jour même)
  maxDaysInAdvance: 90,            // Réservation jusqu'à 90 jours à l'avance
  maxGuestsPerBooking: 10,         // Plafond en ligne (au-delà : par téléphone)
  onlineBookingEnabled: true,      // Interrupteur général
  closedDates: [],                 // Dates exceptionnellement fermées (ex: ["2026-12-25"])
  closedSlots: {}                  // Créneaux fermés par date (ex: {"2026-10-15": ["12:00"]})
});

let dynamicPolicy = { ...DEFAULT_POLICY };

/* Écoute des paramètres globaux de limitation (modifiables directement depuis Firebase Console) */
authReady.then(() => {
  try {
    const settingsDoc = doc(db, 'reservationSettings', 'config');
    onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        dynamicPolicy = {
          ...DEFAULT_POLICY,
          maxTables: Number.isInteger(data.maxTables) && data.maxTables > 0 ? data.maxTables : DEFAULT_POLICY.maxTables,
          maxCovers: Number.isInteger(data.maxCovers) && data.maxCovers > 0 ? data.maxCovers : DEFAULT_POLICY.maxCovers,
          durationMinutes: Number.isInteger(data.durationMinutes) && data.durationMinutes > 0 ? data.durationMinutes : DEFAULT_POLICY.durationMinutes,
          minNoticeMinutes: Number.isInteger(data.minNoticeMinutes) && data.minNoticeMinutes >= 0 ? data.minNoticeMinutes : DEFAULT_POLICY.minNoticeMinutes,
          maxDaysInAdvance: Number.isInteger(data.maxDaysInAdvance) && data.maxDaysInAdvance > 0 ? data.maxDaysInAdvance : DEFAULT_POLICY.maxDaysInAdvance,
          maxGuestsPerBooking: Number.isInteger(data.maxGuestsPerBooking) && data.maxGuestsPerBooking > 0 ? data.maxGuestsPerBooking : DEFAULT_POLICY.maxGuestsPerBooking,
          onlineBookingEnabled: data.onlineBookingEnabled !== false,
          closedDates: Array.isArray(data.closedDates) ? data.closedDates : [],
          closedSlots: (data.closedSlots && typeof data.closedSlots === 'object') ? data.closedSlots : {}
        };
        window.dispatchEvent(new CustomEvent('lcg-policy-updated', { detail: dynamicPolicy }));
      }
    }, (err) => {
      console.warn('[Firebase settings listener]', err);
    });
  } catch (settingsErr) {
    console.warn('[Firebase settings init]', settingsErr);
  }
}).catch(() => {});

function formatMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parisNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function validDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function timeMinutes(value, policy = dynamicPolicy) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < policy.firstSlotMinutes || minutes > policy.lastSlotMinutes ||
      (minutes - policy.firstSlotMinutes) % policy.stepMinutes !== 0) return null;
  return minutes;
}

function tablesForGuests(guests, policy = dynamicPolicy) {
  return Math.ceil(Number(guests) / policy.adultsPerTable);
}

/* Évalue la capacité disponible sur la plage glissante de 60 minutes de la réservation candidate [candStart, candStart + 60 min[ */
function evaluateCapacity(rows, candidate, policy = dynamicPolicy) {
  const candidateGuests = Math.max(1, Math.min(policy.maxGuestsPerBooking, Number(candidate.guests) || 1));
  const candidateTables = tablesForGuests(candidateGuests, policy);
  const candStart = Number(candidate.startMinutes);
  const candEnd = candStart + policy.durationMinutes;

  const overlapping = (rows || []).filter((row) => {
    const status = String(row.status || '').toUpperCase();
    if (!['PENDING', 'CONFIRMED'].includes(status)) return false;
    const rStart = Number(row.startMinutes);
    if (!Number.isInteger(rStart)) return false;
    const rEnd = rStart + policy.durationMinutes;
    return rStart < candEnd && candStart < rEnd;
  });

  const timePoints = new Set([candStart]);
  overlapping.forEach((row) => {
    const rStart = Number(row.startMinutes);
    if (rStart >= candStart && rStart < candEnd) {
      timePoints.add(rStart);
    }
  });

  let maxExistingTables = 0;
  let maxExistingCovers = 0;
  timePoints.forEach((t) => {
    let tTables = 0;
    let tCovers = 0;
    overlapping.forEach((row) => {
      const rStart = Number(row.startMinutes);
      const rEnd = rStart + policy.durationMinutes;
      if (t >= rStart && t < rEnd) {
        tTables += tablesForGuests(row.guests, policy);
        tCovers += Number(row.guests);
      }
    });
    maxExistingTables = Math.max(maxExistingTables, tTables);
    maxExistingCovers = Math.max(maxExistingCovers, tCovers);
  });

  const available = (maxExistingTables + candidateTables <= policy.maxTables) &&
                    (maxExistingCovers + candidateGuests <= policy.maxCovers);

  return {
    available,
    tables: maxExistingTables + candidateTables,
    covers: maxExistingCovers + candidateGuests,
    existingTables: maxExistingTables,
    existingCovers: maxExistingCovers,
    remainingTables: Math.max(0, policy.maxTables - maxExistingTables),
    remainingCovers: Math.max(0, policy.maxCovers - maxExistingCovers)
  };
}

function candidateFrom(data, policy = dynamicPolicy) {
  const date = String(data.date || '').trim();
  const time = String(data.heure || data.time || '').trim();
  const startMinutes = timeMinutes(time, policy);
  const guests = Number(data.couverts || data.guests);
  const now = parisNow();

  if (!validDate(date) || startMinutes == null || !Number.isInteger(guests) || guests < 1 || guests > policy.maxGuestsPerBooking) {
    const error = new Error('Les informations de réservation sont invalides.');
    error.code = 'INVALID_INPUT';
    throw error;
  }

  if (policy.onlineBookingEnabled === false) {
    const error = new Error('Les réservations en ligne sont temporairement indisponibles.');
    error.code = 'BOOKING_DISABLED';
    throw error;
  }

  if (Array.isArray(policy.closedDates) && policy.closedDates.includes(date)) {
    const error = new Error('Les réservations sont fermées pour cette date.');
    error.code = 'DATE_CLOSED';
    throw error;
  }

  const dateClosedSlots = policy.closedSlots && policy.closedSlots[date];
  if (Array.isArray(dateClosedSlots) && dateClosedSlots.includes(time)) {
    const error = new Error('Ce créneau horaire est fermé à la réservation.');
    error.code = 'SLOT_CLOSED';
    throw error;
  }

  if (date < now.date || (date === now.date && startMinutes <= (now.minutes + (policy.minNoticeMinutes || 0)))) {
    const error = new Error('Ce créneau est déjà passé ou trop proche.');
    error.code = 'PAST_TIME';
    throw error;
  }

  return { date, time, startMinutes, guests };
}

/* Enregistrement atomique d'une réservation sous contrôle strict de capacité */
async function reserve(data) {
  await authReady;
  const policy = { ...dynamicPolicy };
  const candidate = candidateFrom(data, policy);
  const capacityDocument = doc(db, 'reservationCapacity', candidate.date);
  const reservation = doc(collection(db, 'reservations'));
  let accepted;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(capacityDocument);
    const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
      ? snapshot.data().reservations
      : [];
    const capacity = evaluateCapacity(current, candidate, policy);
    if (!capacity.available) {
      const error = new Error('Ce créneau est complet (limite de capacité atteinte).');
      error.code = 'CAPACITY_FULL';
      error.capacity = capacity;
      throw error;
    }

    const ledgerReservation = {
      id: reservation.id,
      startMinutes: candidate.startMinutes,
      time: candidate.time,
      guests: candidate.guests,
      status: 'PENDING'
    };
    transaction.set(reservation, {
      ...candidate,
      name: String(data.nom || '').trim().slice(0, 120),
      phone: String(data.telephone || '').trim().slice(0, 80),
      email: String(data.email || '').trim().slice(0, 200),
      preference: String(data.preference || '').trim().slice(0, 120),
      message: String(data.message || '').trim().slice(0, 2000),
      status: 'PENDING',
      createdAt: serverTimestamp()
    });
    transaction.set(capacityDocument, {
      date: candidate.date,
      reservations: current.concat(ledgerReservation),
      updatedAt: serverTimestamp()
    }, { merge: true });
    accepted = { capacity, id: reservation.id };
  });

  return { ok: true, code: 'ACCEPTED', id: accepted.id, ...accepted.capacity };
}

function calculateSlotsForRows(date, currentRows, guests = 1, policy = dynamicPolicy) {
  const numberOfGuests = Math.max(1, Math.min(policy.maxGuestsPerBooking, Number(guests) || 1));
  const now = parisNow();
  const isToday = (date === now.date);
  const isDateClosed = Array.isArray(policy.closedDates) && policy.closedDates.includes(date);
  const dateClosedSlots = (policy.closedSlots && policy.closedSlots[date]) || [];
  const slots = [];

  for (let minutes = policy.firstSlotMinutes; minutes <= policy.lastSlotMinutes; minutes += policy.stepMinutes) {
    const timeStr = formatMinutes(minutes);
    const isPast = isToday && (minutes <= (now.minutes + (policy.minNoticeMinutes || 0)));
    const isSlotClosed = !policy.onlineBookingEnabled || isDateClosed || dateClosedSlots.includes(timeStr);

    let available = false;
    let capacityInfo = { remainingTables: 0, remainingCovers: 0 };

    if (!isPast && !isSlotClosed) {
      const capacity = evaluateCapacity(currentRows, { startMinutes: minutes, guests: numberOfGuests }, policy);
      available = capacity.available;
      capacityInfo = {
        remainingTables: capacity.remainingTables,
        remainingCovers: capacity.remainingCovers
      };
    }

    slots.push({
      time: timeStr,
      startMinutes: minutes,
      available,
      isPast,
      isClosed: isSlotClosed,
      ...capacityInfo
    });
  }
  return {
    date,
    durationMinutes: policy.durationMinutes,
    guests: numberOfGuests,
    onlineBookingEnabled: policy.onlineBookingEnabled && !isDateClosed,
    slots
  };
}

async function availability(date, guests = 1) {
  await authReady;
  if (!validDate(date)) throw new Error('Date invalide.');
  const snapshot = await getDoc(doc(db, 'reservationCapacity', date));
  const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
    ? snapshot.data().reservations
    : [];
  return calculateSlotsForRows(date, current, guests, dynamicPolicy);
}

function subscribeAvailability(date, guests = 1, callback) {
  if (!validDate(date)) {
    callback(new Error('Date invalide.'), null);
    return () => {};
  }
  let unsub = () => {};
  let active = true;

  authReady.then(() => {
    if (!active) return;
    const capacityDoc = doc(db, 'reservationCapacity', date);
    unsub = onSnapshot(capacityDoc, (snapshot) => {
      const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
        ? snapshot.data().reservations
        : [];
      const result = calculateSlotsForRows(date, current, guests, dynamicPolicy);
      callback(null, result);
    }, (err) => {
      console.warn('[Firebase onSnapshot]', err);
      callback(err, null);
    });
  }).catch((err) => {
    callback(err, null);
  });

  return () => {
    active = false;
    unsub();
  };
}

const api = {
  reserve,
  availability,
  subscribeAvailability,
  tablesForGuests,
  evaluateCapacity,
  getPolicy: () => ({ ...dynamicPolicy }),
  DEFAULT_POLICY
};

window.LCGFirebaseReservation = api;
window.dispatchEvent(new CustomEvent('lcg-firebase-ready', { detail: api }));
