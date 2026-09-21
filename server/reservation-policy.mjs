export const RESERVATION_POLICY = Object.freeze({
  timeZone: 'Europe/Paris',
  firstSlotMinutes: 12 * 60,
  lastSlotMinutes: 22 * 60 + 45,
  slotStepMinutes: 15,
  durationMinutes: 60,
  maxReservations: 15,
  maxCovers: 30,
  activeStatuses: Object.freeze(['PENDING', 'CONFIRMED'])
});

export function parseDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date;
}

export function parseTime(value) {
  const time = String(value || '').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return null;
  return { value: time, minutes };
}

export function slots() {
  const result = [];
  for (let minutes = RESERVATION_POLICY.firstSlotMinutes;
       minutes <= RESERVATION_POLICY.lastSlotMinutes;
       minutes += RESERVATION_POLICY.slotStepMinutes) {
    result.push({
      value: formatMinutes(minutes),
      label: formatMinutes(minutes).replace(':', 'h'),
      minutes
    });
  }
  return result;
}

export function formatMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function validateReservation({ date, time, guests, now = parisNow() }) {
  const parsedDate = parseDate(date);
  const parsedTime = parseTime(time);
  const numberOfGuests = Number(guests);
  const slot = parsedTime && slots().find((candidate) => candidate.minutes === parsedTime.minutes);

  if (!parsedDate || !parsedTime || !slot ||
      !Number.isInteger(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 10) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Les informations de réservation sont invalides.' };
  }
  if (parsedDate < now.date || (parsedDate === now.date && parsedTime.minutes <= now.minutes)) {
    return { ok: false, code: 'PAST_TIME', message: 'Ce créneau est déjà passé.' };
  }
  return {
    ok: true,
    date: parsedDate,
    time: slot.value,
    startMinutes: slot.minutes,
    guests: numberOfGuests
  };
}

/**
 * Mesure la charge maximale des réservations qui se chevauchent dans une
 * fenêtre glissante de 60 minutes. Chaque réservation occupe [début, début
 * + 60 min). Les événements de fin sont traités avant ceux qui commencent à
 * la même minute : deux réservations consécutives ne se chevauchent donc pas.
 */
export function evaluateCapacity(rows, candidate) {
  const reservations = rows
    .filter((row) => RESERVATION_POLICY.activeStatuses.includes(String(row.status).toUpperCase()))
    .map((row) => ({
      startMinutes: Number(row.startMinutes),
      guests: Number(row.guests)
    }))
    .filter((row) => Number.isInteger(row.startMinutes) && Number.isInteger(row.guests));

  reservations.push({ startMinutes: candidate.startMinutes, guests: candidate.guests });

  const events = [];
  for (const reservation of reservations) {
    events.push({ minute: reservation.startMinutes, reservationDelta: 1, coverDelta: reservation.guests });
    events.push({
      minute: reservation.startMinutes + RESERVATION_POLICY.durationMinutes,
      reservationDelta: -1,
      coverDelta: -reservation.guests
    });
  }
  events.sort((a, b) => a.minute - b.minute || a.reservationDelta - b.reservationDelta);

  let currentReservations = 0;
  let currentCovers = 0;
  let peakReservations = 0;
  let peakCovers = 0;
  for (const event of events) {
    currentReservations += event.reservationDelta;
    currentCovers += event.coverDelta;
    peakReservations = Math.max(peakReservations, currentReservations);
    peakCovers = Math.max(peakCovers, currentCovers);
  }

  const available = peakReservations <= RESERVATION_POLICY.maxReservations &&
    peakCovers <= RESERVATION_POLICY.maxCovers;
  return {
    available,
    reservations: peakReservations,
    covers: peakCovers,
    remainingReservations: Math.max(0, RESERVATION_POLICY.maxReservations - peakReservations),
    remainingCovers: Math.max(0, RESERVATION_POLICY.maxCovers - peakCovers)
  };
}

export function parisNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: RESERVATION_POLICY.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}
