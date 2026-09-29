// Identité de l'expéditeur d'un mail push, d'après son compte Google ever"T.
// Partagée par le mail push unitaire (generate.js) et la campagne push.
export function getSenderInfo(email) {
  if (email === 'daniel.lumbroso@ever-t.fr') {
    return { nom: 'Daniel Lumbroso', role: 'Fondateur', signature: 'Daniel' }
  }
  if (email === 'quentin.branchet@ever-t.fr') {
    return { nom: 'Quentin Branchet', role: 'Co-fondateur', signature: 'Quentin' }
  }
  const prenom = email.split('.')[0]
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1)
  return { nom: p, role: 'Business Developer', signature: p }
}
