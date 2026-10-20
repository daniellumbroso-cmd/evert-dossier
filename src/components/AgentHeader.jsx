import React from 'react'
import { Link, NavLink } from 'react-router-dom'

// En-tête commun des pages de l'agent : matching, offres reçues, tableau de bord.
const lien = ({ isActive }) => ({
  color: isActive ? '#1400FF' : '#888', textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 700 : 500
})

export default function AgentHeader({ titre }) {
  return (
    <header style={{ background: '#fff', borderBottom: '1px solid #ececf4', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <Link to="/app" style={{ color: '#888', textDecoration: 'none', fontSize: 13 }}>← Générateur</Link>
      <span style={{ fontWeight: 700, fontSize: 15, marginRight: 'auto' }}>{titre}</span>
      <NavLink to="/offre" end style={lien}>Matching</NavLink>
      <NavLink to="/offres" style={lien}>Offres reçues</NavLink>
      <NavLink to="/tableau-de-bord" style={lien}>Tableau de bord</NavLink>
    </header>
  )
}
