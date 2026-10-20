# Agent ever"T : matching, offres, push et relances

## Vue d'ensemble

```
Boond ──(chaque nuit)──► fiches consultants ─┐
Gmail (alertes Collective, mails clients) ──►│ offres ──► matching ──► à valider ──► brouillon Gmail
                                             └──► tableau de bord : intercontrats, fins de mission J-30 / J-15
```

- **Make** déclenche les tâches : la nuit, à l'arrivée d'un mail, pour le résumé quotidien.
- **L'app** fait le travail intelligent : lecture des fiches, matching, rédaction des mails.
- **Supabase** garde la mémoire : consultants, offres, matchs, liste RGPD.
- **Rien n'est envoyé automatiquement.** L'agent prépare des brouillons Gmail ; le bizdev relit, joint le dossier et clique sur « Envoyer ».
- **Pas de scraping** de LinkedIn ni de Collective : on ne lit que les mails que les plateformes nous envoient.

| Page | Rôle |
|---|---|
| `/offre` | Coller une offre ou donner un ID de besoin Boond. Affiche le classement, avec les boutons Valider, Écarter et Préparer le push |
| `/offres` | Offres reçues sur 24 h, 7 jours ou 30 jours, filtrables par source (Collective, Boond, mails clients, saisies) |
| `/tableau-de-bord` | Intercontrats, fins de mission sous 30 jours, matchs à 80+ depuis hier, et les offres récentes adaptées à chaque consultant |

| Route API | Appelée par | Rôle |
|---|---|---|
| `POST /api/agent/index-consultants?page=N` | Make (nuit), script | Boond → fiches consultants |
| `POST /api/agent/ingest-offers` | Make (Gmail) | Mail → offres enregistrées |
| `POST /api/agent/match-offer` | App, Make | Offre → classement des consultants |
| `GET/POST /api/agent/offres` | App, Make | Liste et détail des offres, statut des matchs, liste « ne plus contacter » |
| `POST /api/agent/push-draft` | App uniquement | Brouillon Gmail du push, dans la boîte de la personne connectée |
| `GET /api/agent/alertes` | App, Make (résumé quotidien) | Moments clés |

Les routes acceptent soit une session ever-T, soit l'en-tête `X-Agent-Key: <AGENT_API_KEY>` (Make). `push-draft` exige une session, car le brouillon est créé dans le Gmail de la personne connectée.

## Le matching

1. **Filtre strict**. Il porte d'abord sur la famille de métier, définie dans `api/_lib/metiers.js`. Un consultant n'est retenu que s'il est dans l'un de ces cas :
   - même métier que l'offre ;
   - métier compatible (PO ↔ PM, Chef de projet ↔ PMO…) ;
   - vraie expérience dans ce métier.

   Il porte ensuite sur la disponibilité : le consultant doit être libre au plus 30 jours après le démarrage.
2. **Score pondéré sur 100** (`api/_lib/scoring.js`) : compétences 40, disponibilité 25, famille 15, séniorité 10, lieu 5, TJM 5.
3. **Relecture par Claude** des 10 meilleurs, avec un score final, une justification et les écarts.

Pour modifier les familles ou les poids, éditez ces deux fichiers puis lancez `node --test tests/matching.test.js`.

## Mise en route

### 1. Base Supabase
1. Sur [supabase.com](https://supabase.com), créez un projet (**New project**) :
   - nom : `evert-agent` ;
   - région : **West EU (Paris)** ou **Central EU (Frankfurt)** ;
   - mot de passe : générez-le et rangez-le dans un gestionnaire de mots de passe.
2. Dans **SQL Editor**, ouvrez **New query**, collez `supabase/schema.sql` et cliquez sur **Run**. Le script peut être relancé après chaque mise à jour.
3. Dans **Project Settings → API**, notez la **Project URL** et la clé **service_role**. ⚠️ Cette clé donne un accès total à la base : ne la mettez que dans les variables Vercel.

### 2. Variables Vercel (Production + Preview)
| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role |
| `AGENT_API_KEY` | secret de 40 caractères ou plus, partagé avec Make : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `AGENT_MODEL` | *(facultatif)* modèle Claude, `claude-opus-5-5` par défaut |
| `AGENT_INDEX_PAGE_SIZE` | *(facultatif)* consultants par appel, 12 par défaut |
| `BOOND_RESOURCE_STATES` | *(facultatif)* états Boond à indexer, par ex. `1,2` |
| `CONTACT_TEL`, `CONTACT_EMAIL` | contact affiché dans le PPTX v2 ; remplacent les valeurs écrites en dur |

`BOOND_*`, `ANTHROPIC_API_KEY`, `GOOGLE_*` et `SESSION_SECRET` existent déjà.

### 3. Premier remplissage (depuis un PC)
Avant d'attendre la première nuit, on peut remplir la base tout de suite :
```bash
vercel link
vercel env pull .env.local
node scripts/premier-remplissage.mjs
```
`.env.local` est ignoré par Git. Ne le partagez pas et supprimez-le après usage. En cas d'arrêt, reprenez avec `--page N`. Au premier passage, Claude lit chaque consultant ; les nuits suivantes, il ne relit que les fiches modifiées.

### 4. Scénarios Make

Stockez `AGENT_API_KEY` dans une variable d'organisation Make. Ne l'écrivez pas en clair dans les modules.

**A. Index des consultants, chaque nuit à 2 h**
1. **Schedule** (tous les jours à 2 h), puis **Set variable** : `page = 1`.
2. **Repeater** (100 itérations maximum), puis **HTTP POST** `https://<app>/api/agent/index-consultants?page={{page}}` :
   - en-tête `X-Agent-Key` ;
   - parse response activé ;
   - timeout 300 s.
3. Arrêt quand `page_suivante` est vide ; sinon, `page = page_suivante`.
4. Si `erreurs` n'est pas vide, envoyez une alerte par mail.

**B. Offres Collective et mails clients**
1. **Gmail → Watch emails**, sur le libellé `Collective` (créez un filtre Gmail sur l'expéditeur des alertes Collective).
2. **HTTP POST** `/api/agent/ingest-offers`. Corps JSON :
   ```json
   { "message_id": "{{id}}", "from": "{{from}}", "subject": "{{subject}}", "received_at": "{{date}}", "text": "{{text}}", "html": "{{html}}" }
   ```
3. **Iterator** sur `offres`, puis **HTTP POST** `/api/agent/match-offer` avec `{ "offre_id": "{{offre_id}}" }` (timeout 300 s).
4. *(facultatif)* Si le premier résultat a un score ≥ 80, envoyez un message **Slack** : consultant, offre et lien `https://<app>/offre?id={{offre_id}}`.

Pour les besoins exprimés par mail par un client : même scénario, avec un libellé Gmail `Besoins clients` et `"source": "email"`.

**C. Résumé quotidien à 8 h 30**
1. **HTTP GET** `/api/agent/alertes`.
2. Envoi par **Slack** ou par mail du champ `resume` et de la liste `fins_mission` : nom, palier J-15 / J-30, offres proposées.

**D. RGPD : réponses « STOP »**
1. **Gmail → Watch emails**, sur les réponses contenant « STOP ».
2. **HTTP POST** `/api/agent/offres` avec `{ "action": "ne_plus_contacter", "email": "{{from}}" }`.

Chaque mail de push se termine par la phrase : « répondez STOP pour ne plus recevoir nos propositions ».

## Données et sécurité
- Les tables Supabase ont la sécurité par ligne (RLS) activée, sans aucune règle : seul le serveur, avec la clé service_role, y accède.
- Les emails, téléphones, adresses et données administratives des consultants **ne sont pas envoyés** à Claude.
- Avant chaque push, l'app vérifie la liste « ne plus contacter ».
- Durée de conservation : à fixer avec Daniel (proposition : purger les offres archivées de plus de 12 mois).

## À faire plus tard
- Clients sans contact depuis X jours : demande une lecture des actions Boond par société.
- Générer le dossier ciblé directement depuis un match, puis le joindre au brouillon.
- Mesurer la qualité du classement sur les positionnements passés (gagnés et perdus) dans Boond, puis ajuster les poids à partir des validations et des écartements.
- API Zeliq et Lusha, si vos abonnements les incluent.
