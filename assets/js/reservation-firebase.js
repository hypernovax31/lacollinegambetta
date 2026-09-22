/* Réservations La Colline — Firebase Spark / Firestore
 *
 * La configuration publique est isolée dans firebase-config.js. La
 * protection vient de l'authentification anonyme et des règles Firestore,
 * pas d'un secret dans le navigateur.
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
/* Évite un « Unhandled promise rejection » lorsque l'authentification
 * anonyme n'est pas encore activée dans le projet : reserve() reprend la
 * même promesse et remontera l'erreur à l'interface. */
authReady.catch((error) => console.error('[réservation Firebase]', error));

const POLICY = Object.freeze({
  firstSlotMinutes: 12 * 60,       // 12h00
  lastSlotMinutes: 22 * 60 + 45,   // 22h45
  stepMinutes: 15,
  durationMinutes: 60,             // Plage glissante d'une heure
  adultsPerTable: 2,               // 1-2 pers = 1 table, 3-4 = 2 tables, etc.
  maxTables: 15,                   // Maximum 15 tables simultanées
  maxCovers: 30                    // Maximum 30 couverts simultanés
});

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

function timeMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < POLICY.firstSlotMinutes || minutes > POLICY.lastSlotMinutes ||
      (minutes - POLICY.firstSlotMinutes) % POLICY.stepMinutes !== 0) return null;
  return minutes;
}

/* Une réservation est comptée en tables :
 * 1 à 2 personnes = 1 table ; 3 à 4 personnes = 2 tables ; 5 à 6 personnes = 3 tables, etc.
 * Plafond du nombre de personnes divisé par deux. */
function tablesForGuests(guests) {
  return Math.ceil(Number(guests) / POLICY.adultsPerTable);
}

/* Évalue la capacité disponible sur la plage glissante de 60 minutes de la réservation candidate [candStart, candStart + 60 min[ */
function evaluateCapacity(rows, candidate) {
  const candidateGuests = Math.max(1, Math.min(10, Number(candidate.guests) || 1));
  const candidateTables = tablesForGuests(candidateGuests);
  const candStart = Number(candidate.startMinutes);
  const candEnd = candStart + POLICY.durationMinutes;

  const overlapping = (rows || []).filter((row) => {
    const status = String(row.status || '').toUpperCase();
    if (!['PENDING', 'CONFIRMED'].includes(status)) return false;
    const rStart = Number(row.startMinutes);
    if (!Number.isInteger(rStart)) return false;
    const rEnd = rStart + POLICY.durationMinutes;
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
      const rEnd = rStart + POLICY.durationMinutes;
      if (t >= rStart && t < rEnd) {
        tTables += tablesForGuests(row.guests);
        tCovers += Number(row.guests);
      }
    });
    maxExistingTables = Math.max(maxExistingTables, tTables);
    maxExistingCovers = Math.max(maxExistingCovers, tCovers);
  });

  const available = (maxExistingTables + candidateTables <= POLICY.maxTables) &&
                    (maxExistingCovers + candidateGuests <= POLICY.maxCovers);

  return {
    available,
    tables: maxExistingTables + candidateTables,
    covers: maxExistingCovers + candidateGuests,
    existingTables: maxExistingTables,
    existingCovers: maxExistingCovers,
    remainingTables: Math.max(0, POLICY.maxTables - maxExistingTables),
    remainingCovers: Math.max(0, POLICY.maxCovers - maxExistingCovers)
  };
}

function candidateFrom(data) {
  const date = String(data.date || '').trim();
  const time = String(data.heure || data.time || '').trim();
  const startMinutes = timeMinutes(time);
  const guests = Number(data.couverts || data.guests);
  const now = parisNow();
  if (!validDate(date) || startMinutes == null || !Number.isInteger(guests) || guests < 1 || guests > 10) {
    const error = new Error('Les informations de réservation sont invalides.');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  if (date < now.date || (date === now.date && startMinutes <= now.minutes)) {
    const error = new Error('Ce créneau est déjà passé.');
    error.code = 'PAST_TIME';
    throw error;
  }
  return { date, time, startMinutes, guests };
}

async function reserve(data) {
  await authReady;
  const candidate = candidateFrom(data);
  const capacityDocument = doc(db, 'reservationCapacity', candidate.date);
  const reservation = doc(collection(db, 'reservations'));
  let accepted;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(capacityDocument);
    const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
      ? snapshot.data().reservations
      : [];
    const capacity = evaluateCapacity(current, candidate);
    if (!capacity.available) {
      const error = new Error('Ce créneau est complet.');
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

function calculateSlotsForRows(date, currentRows, guests = 1) {
  const numberOfGuests = Math.max(1, Math.min(10, Number(guests) || 1));
  const slots = [];
  for (let minutes = POLICY.firstSlotMinutes; minutes <= POLICY.lastSlotMinutes; minutes += POLICY.stepMinutes) {
    const capacity = evaluateCapacity(currentRows, { startMinutes: minutes, guests: numberOfGuests });
    slots.push({
      time: formatMinutes(minutes),
      startMinutes: minutes,
      available: capacity.available,
      remainingTables: capacity.remainingTables,
      remainingCovers: capacity.remainingCovers
    });
  }
  return { date, durationMinutes: POLICY.durationMinutes, guests: numberOfGuests, slots };
}

async function availability(date, guests = 1) {
  await authReady;
  if (!validDate(date)) throw new Error('Date invalide.');
  const snapshot = await getDoc(doc(db, 'reservationCapacity', date));
  const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
    ? snapshot.data().reservations
    : [];
  return calculateSlotsForRows(date, current, guests);
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
      const result = calculateSlotsForRows(date, current, guests);
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
  POLICY
};
window.LCGFirebaseReservation = api;
window.dispatchEvent(new CustomEvent('lcg-firebase-ready', { detail: api }));
