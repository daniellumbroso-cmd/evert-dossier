// Créneaux libres du bizdev, lus dans son Google Agenda, pour les proposer
// dans les mails push.
//
// Seule la disponibilité est lue (autorisation « calendar.freebusy ») : ni le
// titre ni le contenu des rendez-vous ne remontent jusqu'à l'application.
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

const TZ = 'Europe/Paris'
const SLOT_MINUTES = 30
// Heures de début proposées, en heure de Paris
const START_TIMES = [[9, 30], [10, 30], [11, 30], [14, 0], [15, 0], [16, 0], [17, 0]]
const WINDOW_DAYS = 6          // jours ouvrés couverts, à partir du prochain jour ouvré
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Décalage de Paris par rapport à UTC, en minutes, à un instant donné (gère l'heure d'été).
function parisOffset(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date)
  const get = t => Number(parts.find(p => p.type === t).value)
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - date.getTime()) / 60000)
}

function parisToUtc(y, m, d, h, min) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min))
  return new Date(guess.getTime() - parisOffset(guess) * 60000)
}

function parisToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [y, m, d] = parts.split('-').map(Number)
  return { y, m, d }
}

// Jours fériés français : dates fixes + Pâques et ses dérivés.
function feries(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  const paques = Date.UTC(year, month - 1, day)
  const plus = n => new Date(paques + n * 86400000).toISOString().slice(0, 10)
  return new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`, `${year}-07-14`,
    `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
    plus(1), plus(39), plus(50)   // lundi de Pâques, Ascension, lundi de Pentecôte
  ])
}

// Prochains jours ouvrés, hors aujourd'hui (le prospect doit avoir le temps de répondre).
function nextWorkingDays(count) {
  const { y, m, d } = parisToday()
  const days = []
  let cursor = Date.UTC(y, m - 1, d)
  while (days.length < count) {
    cursor += 86400000
    const dt = new Date(cursor)
    const iso = dt.toISOString().slice(0, 10)
    if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || feries(dt.getUTCFullYear()).has(iso)) continue
    days.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() })
  }
  return days
}

const label = (day, h, min) =>
  `${JOURS[day.dow]} ${String(day.d).padStart(2, '0')}/${String(day.m).padStart(2, '0')} à ${h}h${min ? String(min).padStart(2, '0') : ''}`

// Créneaux libres regroupés par jour. `busy` : [{ start, end }] renvoyé par Google.
export function freeSlotsByDay(busy, days = nextWorkingDays(WINDOW_DAYS)) {
  const intervals = busy.map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()])
  return days.map(day => ({
    day,
    slots: START_TIMES
      .map(([h, min]) => {
        const start = parisToUtc(day.y, day.m, day.d, h, min).getTime()
        const end = start + SLOT_MINUTES * 60000
        return { start, label: label(day, h, min), free: !intervals.some(([s, e]) => s < end && e > start) }
      })
      .filter(s => s.free)
  })).filter(g => g.slots.length)
}

// Trois créneaux par mail, sur trois jours différents. Chaque jour distribue ses
// créneaux à tour de rôle : si deux prospects acceptent, ils ne tombent pas sur
// le même créneau (tant que l'agenda en offre assez).
export function assignSlots(groups, count, perMail = 3) {
  if (!groups.length) return Array.from({ length: count }, () => [])
  const n = Math.min(perMail, groups.length)
  const cursor = groups.map((_, i) => i * 2)   // décalage : pas la même heure tous les jours
  return Array.from({ length: count }, (_, k) => {
    const picks = []
    for (let j = 0; j < n; j++) {
      const gi = (k * n + j) % groups.length
      const g = groups[gi]
      picks.push(g.slots[cursor[gi]++ % g.slots.length])
    }
    return picks.sort((a, b) => a.start - b.start).map(s => s.label)
  })
}

// Lecture des disponibilités du bizdev connecté.
export async function fetchBusy(session) {
  const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: session.access_token, refresh_token: session.refresh_token })
  const days = nextWorkingDays(WINDOW_DAYS)
  const first = days[0], last = days[days.length - 1]
  const calendar = google.calendar({ version: 'v3', auth })
  const r = await calendar.freebusy.query({
    requestBody: {
      timeMin: parisToUtc(first.y, first.m, first.d, 0, 0).toISOString(),
      timeMax: parisToUtc(last.y, last.m, last.d, 23, 59).toISOString(),
      timeZone: TZ,
      items: [{ id: 'primary' }]
    }
  })
  const cal = r.data.calendars?.primary
  if (cal?.errors?.length) throw new Error('Agenda illisible : ' + cal.errors.map(e => e.reason).join(', '))
  return { busy: cal?.busy || [], days }
}
