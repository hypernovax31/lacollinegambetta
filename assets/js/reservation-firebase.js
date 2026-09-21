/* Réservations La Colline — Firebase Spark / Firestore
 *
 * Ce module utilise le même projet Firebase que Mission Nautilus. La
 * configuration Firebase est publique par conception ; la protection vient
 * de l'authentification anonyme et des règles Firestore, pas d'un secret dans
 * le navigateur.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB5ivqXO1W9fZqqhwJ0uDnLgVgvWSfQz50',
  authDomain: 'mission-nautilus.firebaseapp.com',
  projectId: 'mission-nautilus',
  storageBucket: 'mission-nautilus.firebasestorage.app',
  messagingSenderId: '444670686419',
  appId: '1:444670686419:web:00d186940a2fb8c8c29026'
};

const app = initializeApp(firebaseConfig, 'lacolline-gambetta-reservations');
const auth = getAuth(app);
const db = getFirestore(app);
const authReady = signInAnonymously(auth);

const POLICY = Object.freeze({
  firstSlotMinutes: 12 * 60,
  lastSlotMinutes: 22 * 60 + 45,
  stepMinutes: 15,
  durationMinutes: 60,
  maxReservations: 15,
  maxCovers: 30
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

function evaluateCapacity(rows, candidate) {
  const active = rows
    .filter((row) => ['PENDING', 'CONFIRMED'].includes(String(row.status || '').toUpperCase()))
    .map((row) => ({ startMinutes: Number(row.startMinutes), guests: Number(row.guests) }))
    .filter((row) => Number.isInteger(row.startMinutes) && Number.isInteger(row.guests));
  active.push({ startMinutes: candidate.startMinutes, guests: candidate.guests });

  const events = [];
  active.forEach((reservation) => {
    events.push({ minute: reservation.startMinutes, reservationDelta: 1, coverDelta: reservation.guests });
    events.push({
      minute: reservation.startMinutes + POLICY.durationMinutes,
      reservationDelta: -1,
      coverDelta: -reservation.guests
    });
  });
  events.sort((a, b) => a.minute - b.minute || a.reservationDelta - b.reservationDelta);

  let reservations = 0;
  let covers = 0;
  let peakReservations = 0;
  let peakCovers = 0;
  events.forEach((event) => {
    reservations += event.reservationDelta;
    covers += event.coverDelta;
    peakReservations = Math.max(peakReservations, reservations);
    peakCovers = Math.max(peakCovers, covers);
  });

  return {
    available: peakReservations <= POLICY.maxReservations && peakCovers <= POLICY.maxCovers,
    reservations: peakReservations,
    covers: peakCovers,
    remainingReservations: Math.max(0, POLICY.maxReservations - peakReservations),
    remainingCovers: Math.max(0, POLICY.maxCovers - peakCovers)
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

async function availability(date, guests = 1) {
  await authReady;
  if (!validDate(date)) throw new Error('Date invalide.');
  const snapshot = await getDoc(doc(db, 'reservationCapacity', date));
  const current = snapshot.exists() && Array.isArray(snapshot.data().reservations)
    ? snapshot.data().reservations
    : [];
  const numberOfGuests = Math.max(1, Math.min(10, Number(guests) || 1));
  const slots = [];
  for (let minutes = POLICY.firstSlotMinutes; minutes <= POLICY.lastSlotMinutes; minutes += POLICY.stepMinutes) {
    const capacity = evaluateCapacity(current, { startMinutes: minutes, guests: numberOfGuests });
    slots.push({ value: formatMinutes(minutes), available: capacity.available, ...capacity });
  }
  return { date, durationMinutes: POLICY.durationMinutes, slots };
}

window.LCGFirebaseReservation = { reserve, availability, POLICY };
