/* Réservations La Colline — Firebase Spark / Firestore & Moteur de Capacité
 *
 * Système de limitation stricte par plage glissante de 60 minutes :
 * - Capacité maximale : 15 tables ou 30 personnes simultanées
 * - Gestion atomique Cloud Firestore (avec synchronisation locale résiliente)
 * - Verrouillage instantané des créneaux complets
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
if (!firebaseConfig || !firebaseConfig.projectId) {
  throw new Error('Configuration Firebase La Colline absente ou incorrecte.');
}

const app = initializeApp(firebaseConfig, 'lacolline-gambetta-reservations');
const auth = getAuth(app);
const db = getFirestore(app);

/* Émulateur uniquement si explicitement demandé par configuration */
if (window.LCG_USE_EMULATORS === true) {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch (emuErr) {
    console.warn('[Firebase emulator init]', emuErr);
  }
}

let authState = { ready: false, user: null, error: null };
const authReady = signInAnonymously(auth)
  .then((userCredential) => {
    authState.ready = true;
    authState.user = userCredential.user;
    console.info('[Firebase Auth] Authentification anonyme active (UID: ' + userCredential.user.uid + ')');
    return userCredential.user;
  })
  .catch((error) => {
    authState.error = error;
    console.warn('[Firebase Auth] Connexion anonyme non active ou restreinte:', error.code || error.message);
    return null;
  });

const DEFAULT_POLICY = Object.freeze({
  firstSlotMinutes: 12 * 60,       // 12h00
  lastSlotMinutes: 22 * 60 + 45,   // 22h45
  stepMinutes: 15,                 // Créneaux de 15 min
  durationMinutes: 60,             // Plage glissante d'une heure
  adultsPerTable: 2,               // 1-2 pers = 1 table, 3-4 = 2 tables, etc.
  maxTables: 15,                   // Maximum 15 tables simultanées
  maxCovers: 30,                   // Maximum 30 personnes simultanées
  // Aucune date maximale : tous les jours futurs restent réservables.
  maxGuestsPerBooking: 10,         // Plafond en ligne
  onlineBookingEnabled: true,      // Interrupteur général
  closedDates: [],                 // Dates exceptionnellement fermées
  closedSlots: {}                  // Créneaux fermés par date
});

let dynamicPolicy = { ...DEFAULT_POLICY };

/* Registre local persistant pour garantir la limitation même hors ligne ou en test */
const LEDGER_STORAGE_KEY = 'lcg_reservation_ledger_v2';
function getLocalLedger() {
  try {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveLocalLedger(ledger) {
  try {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger));
  } catch (e) {}
}

function getRowsForDate(date) {
  const ledger = getLocalLedger();
  return Array.isArray(ledger[date]) ? ledger[date] : [];
}

function mergeDateRows(date, remoteRows) {
  const localRows = getRowsForDate(date);
  const map = new Map();
  localRows.forEach((r) => { if (r && r.id) map.set(r.id, r); });
  (remoteRows || []).forEach((r) => { if (r && r.id) map.set(r.id, r); });
  const merged = Array.from(map.values());
  const ledger = getLocalLedger();
  ledger[date] = merged;
  saveLocalLedger(ledger);
  return merged;
}

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

/* Évalue la capacité disponible sur la plage glissante de 60 minutes [candStart, candStart + 60 min[ */
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
    const error = new Error('Les réservations en ligne sont temporairement fermées.');
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

  if (date < now.date || (date === now.date && startMinutes < now.minutes)) {
    const error = new Error('Ce créneau est déjà passé.');
    error.code = 'PAST_TIME';
    throw error;
  }

  return { date, time, startMinutes, guests };
}

/* Enregistrement sécurisé & atomique sous contrôle de capacité strict */
async function reserve(data) {
  const policy = { ...dynamicPolicy };
  const candidate = candidateFrom(data, policy);

  // Vérification de sécurité préalable sur le registre local
  const currentLocal = getRowsForDate(candidate.date);
  const localCapacity = evaluateCapacity(currentLocal, candidate, policy);
  if (!localCapacity.available) {
    const error = new Error('Ce créneau est complet.');
    error.code = 'CAPACITY_FULL';
    error.capacity = localCapacity;
    error.capacityFull = true;
    throw error;
  }

  const reservationId = 'res_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  const ledgerReservation = {
    id: reservationId,
    startMinutes: candidate.startMinutes,
    time: candidate.time,
    guests: candidate.guests,
    status: 'PENDING',
    createdAt: Date.now()
  };

  let firestoreCommitted = false;
  let acceptedCapacity = localCapacity;

  /*
   * The individual reservation and the day capacity ledger MUST be written
   * in one Firestore transaction.  The former implementation used addDoc()
   * followed by a read/write of reservationCapacity, which allowed two
   * simultaneous clients to both observe a free slot and exceed the 30-cover
   * limit.  A transaction re-reads the day document when it is contested and
   * aborts the later request after the capacity check is repeated.
   */
  try {
    await authReady;

    const reservationRef = doc(collection(db, 'reservations'));
    const capacityRef = doc(db, 'reservationCapacity', candidate.date);
    const reservationData = {
      ...candidate,
      name: String(data.nom || '').trim().slice(0, 120),
      phone: String(data.telephone || '').trim().slice(0, 80),
      email: String(data.email || '').trim().slice(0, 200),
      preference: String(data.preference || '').trim().slice(0, 120),
      message: String(data.message || '').trim().slice(0, 2000),
      status: 'CONFIRMED',
      createdAt: serverTimestamp()
    };

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(capacityRef);
      const remoteRows = snapshot.exists() && Array.isArray(snapshot.data().reservations)
        ? snapshot.data().reservations
        : [];
      const rows = mergeDateRows(candidate.date, remoteRows);
      const capacity = evaluateCapacity(rows, candidate, policy);

      if (!capacity.available) {
        const error = new Error('Ce créneau est complet.');
        error.code = 'CAPACITY_FULL';
        error.capacity = capacity;
        error.capacityFull = true;
        throw error;
      }

      const committedRow = {
        id: reservationRef.id,
        startMinutes: candidate.startMinutes,
        time: candidate.time,
        guests: candidate.guests,
        status: 'CONFIRMED',
        createdAt: Date.now()
      };
      const nextRows = rows.filter((row) => row && row.id !== reservationRef.id);

      transaction.set(reservationRef, reservationData);
      transaction.set(capacityRef, {
        date: candidate.date,
        reservations: nextRows.concat(committedRow),
        updatedAt: serverTimestamp()
      }, { merge: true });

      acceptedCapacity = capacity;
      ledgerReservation.id = reservationRef.id;
    });

    firestoreCommitted = true;
    console.info('[Firebase Firestore] Réservation et capacité validées atomiquement. Document ID =', reservationRef.id);
  } catch (fsError) {
    console.error('[Firebase Firestore] Échec de la validation atomique:', fsError);
    if (fsError && fsError.code === 'CAPACITY_FULL') {
      throw fsError;
    }
    if (fsError && fsError.code) {
      console.error('[Firebase Firestore Code]:', fsError.code);
    }
    const error = new Error('La réservation n’a pas pu être validée.');
    error.code = 'FIREBASE_WRITE_FAILED';
    error.cause = fsError;
    throw error;
  }

  // Enregistrement local uniquement après une validation Firestore réussie.
  const currentUpdated = getRowsForDate(candidate.date);
  const mergedWithNew = currentUpdated.filter((row) => row && row.id !== ledgerReservation.id);
  mergedWithNew.push(ledgerReservation);
  const ledger = getLocalLedger();
  ledger[candidate.date] = mergedWithNew;
  saveLocalLedger(ledger);

  window.dispatchEvent(new CustomEvent('lcg-capacity-changed', {
    detail: { date: candidate.date }
  }));

  return {
    ok: true,
    code: 'ACCEPTED',
    id: ledgerReservation.id,
    firestore: firestoreCommitted,
    ...acceptedCapacity
  };
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
    const isPast = isToday && (minutes < now.minutes);
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
  if (!validDate(date)) throw new Error('Date invalide.');
  let currentRows = getRowsForDate(date);

  try {
    await authReady;
    const snapshot = await getDoc(doc(db, 'reservationCapacity', date));
    if (snapshot.exists() && Array.isArray(snapshot.data().reservations)) {
      currentRows = mergeDateRows(date, snapshot.data().reservations);
    }
  } catch (err) {
    console.warn('[Firebase availability read]', err);
  }

  return calculateSlotsForRows(date, currentRows, guests, dynamicPolicy);
}

function subscribeAvailability(date, guests = 1, callback) {
  if (!validDate(date)) {
    callback(new Error('Date invalide.'), null);
    return () => {};
  }
  let unsub = () => {};
  let active = true;

  // Réponse instantanée avec les données locales
  const initialRows = getRowsForDate(date);
  callback(null, calculateSlotsForRows(date, initialRows, guests, dynamicPolicy));

  const onLocalChange = (e) => {
    if (!active) return;
    if (e.detail && e.detail.date === date) {
      const updatedRows = getRowsForDate(date);
      callback(null, calculateSlotsForRows(date, updatedRows, guests, dynamicPolicy));
    }
  };
  window.addEventListener('lcg-capacity-changed', onLocalChange);

  authReady.then(() => {
    if (!active) return;
    const capacityDoc = doc(db, 'reservationCapacity', date);
    unsub = onSnapshot(capacityDoc, (snapshot) => {
      const remoteRows = snapshot.exists() && Array.isArray(snapshot.data().reservations)
        ? snapshot.data().reservations
        : [];
      const mergedRows = mergeDateRows(date, remoteRows);
      const result = calculateSlotsForRows(date, mergedRows, guests, dynamicPolicy);
      callback(null, result);
    }, (err) => {
      console.warn('[Firebase onSnapshot]', err);
    });
  }).catch((err) => {
    console.warn('[Firebase subscribe error]', err);
  });

  return () => {
    active = false;
    window.removeEventListener('lcg-capacity-changed', onLocalChange);
    unsub();
  };
}

const api = {
  reserve,
  availability,
  subscribeAvailability,
  tablesForGuests,
  evaluateCapacity,
  getRowsForDate,
  getPolicy: () => ({ ...dynamicPolicy }),
  DEFAULT_POLICY
};

window.LCGFirebaseReservation = api;
window.dispatchEvent(new CustomEvent('lcg-firebase-ready', { detail: api }));
