import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export default function handler(req, res) {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.file',
      // Disponibilités seulement (pas le contenu des rendez-vous) : créneaux des mails push
      'https://www.googleapis.com/auth/calendar.freebusy',
      // Campagne push : brouillons Gmail ; synchro Gmail → Boond : lecture des mails envoyés
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly'
    ],
    prompt: 'consent'
  })
  res.redirect(url)
}
