// Parse **gras** en JSX
function RichText({ text, style = {} }) {
  if (!text) return null
  const parts = text.split(/(**[^*]+**)/g)
  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

export default function DossierPreview({ dossier: d }) {
  const s = {
    page: {
      background: '#fff', border: '1.5px solid #e8e8f0', borderRadius: 16,
      padding: '2.5rem', fontFamily: 'Montserrat, sans-serif', fontSize: 14,
      lineHeight: 1.7, color: '#111', maxWidth: '100%'
    },
    headerBlock: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fff', borderBottom: '2px solid #1400FF',
      padding: '1.25rem 1.5rem', marginBottom: '2rem', borderRadius: '10px 10px 0 0'
    },
    name: { fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, margin: 0, color: '#1400FF' },
    role: { fontSize: 13, color: '#666', marginTop: 4, fontFamily: 'Montserrat, sans-serif' },
    badge: {
      flexShrink: 0
    },
    sectionTitle: {
      fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '0.1em', color: '#1400FF',
      borderBottom: '1px solid #e8e8f0', paddingBottom: 6,
      margin: '2rem 0 1rem'
    },
    subTitle: { fontWeight: 500, fontSize: 13, margin: '0 0 4px', color: '#0a0a0a' },
    muted: { color: '#9a9a90' },
    expBlock: {
      borderLeft: '3px solid #1400FF', paddingLeft: '1rem',
      marginBottom: '1.5rem', paddingBottom: '0.5rem'
    },
    expTitle: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, margin: '0 0 2px' },
    expDates: { fontSize: 12, color: '#9a9a90', margin: '0 0 8px', fontStyle: 'italic' },
    actTheme: {
      fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
      color: '#5c5c55', margin: '10px 0 4px'
    },
    ul: { paddingLeft: '1rem', margin: '0 0 4px' },
    li: { marginBottom: 3, fontSize: 13 },
    tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 },
    tag: {
      fontSize: 11, padding: '3px 8px',
      background: '#f0f0ff', borderRadius: 20,
      color: '#1400FF', border: '1px solid #d0d0f0'
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerBlock}>
        <div>
          <p style={s.name}>{d.nom}</p>
          <p style={s.role}>{d.titre}</p>
        </div>
        <img src="/evert-logo.png" alt="ever&quot;T" style={{ height: 112, width: 'auto', opacity: 0.9 }} />
      </div>

      {/* RÉSUMÉ */}
      <div style={s.sectionTitle}>Résumé</div>

      {d.a_propos && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={s.subTitle}>À propos</p>
          {d.a_propos.split('\n\n').map((para, i) => (
            <p key={i} style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.7 }}>
              <RichText text={para} />
            </p>
          ))}
        </div>
      )}

      {d.principales_experiences?.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={s.subTitle}>Principales Expériences</p>
          <ul style={s.ul}>
            {d.principales_experiences.map((e, i) => (
              <li key={i} style={s.li}>
                <strong>{e.entreprise}</strong> — {e.role}
                {e.stack && <span style={{ color: '#5c5c55' }}> {e.stack}</span>}
                <span style={{ color: '#9a9a90', fontSize: 12 }}> ({e.dates})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.competences_techniques?.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={s.subTitle}>Connaissances Techniques</p>
          <ul style={s.ul}>
            {d.competences_techniques.map((cat, i) => (
              <li key={i} style={s.li}>
                <strong>{cat.categorie} :</strong> {cat.items.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* EXPÉRIENCES */}
      {d.experiences?.length > 0 && (
        <>
          <div style={s.sectionTitle}>Expériences</div>
          {d.experiences.map((exp, i) => (
            <div key={i} style={s.expBlock}>
              <p style={s.expTitle}>
                {exp.entreprise}
                <span style={{ fontWeight: 400, color: '#5c5c55' }}> — {exp.role}</span>
                {exp.stack && <span style={{ fontWeight: 400, color: '#9a9a90', fontSize: 13 }}> {exp.stack}</span>}
              </p>
              <p style={s.expDates}>{exp.dates}</p>

              {exp.projet && (
                <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                  <strong>Projet :</strong> {exp.projet}
                </p>
              )}

              {exp.activites?.map((act, j) => (
                <div key={j}>
                  <p style={s.actTheme}>{act.theme}</p>
                  <ul style={s.ul}>
                    {act.points?.map((p, k) => <li key={k} style={s.li}>{p}</li>)}
                  </ul>
                </div>
              ))}

              {exp.enjeux?.length > 0 && (
                <div>
                  <p style={s.actTheme}>Enjeux</p>
                  <ul style={s.ul}>
                    {exp.enjeux.map((e, j) => <li key={j} style={s.li}>{e}</li>)}
                  </ul>
                </div>
              )}

              {exp.resultats?.length > 0 && (
                <div>
                  <p style={s.actTheme}>Résultats</p>
                  <ul style={s.ul}>
                    {exp.resultats.map((r, j) => <li key={j} style={s.li}>{r}</li>)}
                  </ul>
                </div>
              )}

              {exp.env_technique?.length > 0 && (
                <div style={s.tagRow}>
                  {exp.env_technique.map((t, j) => (
                    <span key={j} style={s.tag}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* FORMATION */}
      {d.formations?.length > 0 && (
        <>
          <div style={s.sectionTitle}>Formation & Certifications</div>
          <ul style={s.ul}>
            {d.formations.map((f, i) => (
              <li key={i} style={s.li}>
                <strong>{f.diplome}</strong>
                {f.ecole && <span> — {f.ecole}</span>}
                {f.annee && <span style={{ color: '#9a9a90' }}> ({f.annee})</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* LANGUES */}
      {d.langues?.length > 0 && (
        <>
          <div style={s.sectionTitle}>Langues</div>
          <ul style={s.ul}>
            {d.langues.map((l, i) => (
              <li key={i} style={s.li}><strong>{l.langue}</strong> — {l.niveau}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
