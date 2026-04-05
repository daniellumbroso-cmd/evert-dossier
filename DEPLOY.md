# 🚀 Guide de déploiement — Ever"T Dossier Generator

Temps estimé : **45 minutes** (dont 20 min d'attente Google)
Niveau requis : aucune compétence dev nécessaire

---

## Ce que vous allez faire

1. Créer un repo GitHub et y pousser le code
2. Créer un projet Google Cloud (OAuth + Drive API)
3. Créer un dossier Google Drive partagé
4. Déployer sur Vercel
5. Configurer les variables d'environnement
6. Tester

---

## ÉTAPE 1 — GitHub (10 min)

### 1.1 Créer un compte GitHub (si pas déjà fait)
→ https://github.com/signup

### 1.2 Créer un nouveau repo
→ https://github.com/new
- Name : `evert-dossier`
- Visibility : **Private** ⚠️ (le code contient la config de votre app)
- Cliquer "Create repository"

### 1.3 Pousser le code
Ouvrez un terminal dans le dossier du projet et exécutez :

```bash
git init
git add .
git commit -m "Initial commit — Ever\"T Dossier Generator"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/evert-dossier.git
git push -u origin main
```

---

## ÉTAPE 2 — Google Cloud Console (20 min)

### 2.1 Créer un projet Google Cloud
→ https://console.cloud.google.com/
- Cliquer sur le sélecteur de projet (en haut) → "Nouveau projet"
- Nom : `EverT Dossier`
- Cliquer "Créer"

### 2.2 Activer les APIs nécessaires
Dans le menu → "APIs et services" → "Bibliothèque"

Rechercher et activer ces 3 APIs :
- ✅ **Google Drive API**
- ✅ **Google Docs API**
- ✅ **Google People API** (ou Google+ API)

### 2.3 Configurer l'écran de consentement OAuth
→ APIs et services → Écran de consentement OAuth
- Type : **Interne** (important — seuls les comptes @ever-t.com pourront se connecter)
- Nom de l'application : `Ever"T Dossier Generator`
- Email d'assistance : votre email @ever-t.com
- Cliquer "Enregistrer et continuer" jusqu'à la fin

### 2.4 Créer les identifiants OAuth
→ APIs et services → Identifiants → "+ Créer des identifiants" → "ID client OAuth 2.0"
- Type : **Application Web**
- Nom : `EverT Dossier Web`
- Origines JavaScript autorisées :
  - `http://localhost:5173` (pour les tests locaux)
  - `https://votre-app.vercel.app` (à compléter après déploiement Vercel)
- URI de redirection autorisés :
  - `http://localhost:3001/api/auth/callback`
  - `https://votre-app.vercel.app/api/auth/callback`
- Cliquer "Créer"

⚠️ **Notez le Client ID et le Client Secret** — vous en aurez besoin à l'étape 4.

---

## ÉTAPE 3 — Google Drive (5 min)

### 3.1 Créer le dossier partagé
→ Ouvrir Google Drive avec votre compte @ever-t.com
- Créer un dossier : `Ever"T / Dossiers candidats`
- Partager ce dossier avec toute l'équipe Ever"T (accès "Éditeur")

### 3.2 Récupérer l'ID du dossier
- Ouvrir le dossier dans Drive
- L'URL ressemble à : `https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74`
- L'ID est la partie après `/folders/` → dans cet exemple : `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74`
- ⚠️ **Notez cet ID**

---

## ÉTAPE 4 — Vercel (10 min)

### 4.1 Créer un compte Vercel
→ https://vercel.com/signup
- Se connecter avec GitHub (recommandé)

### 4.2 Importer le projet
→ https://vercel.com/new
- Sélectionner votre repo `evert-dossier`
- Cliquer "Import"
- Laisser les paramètres par défaut (Vercel détecte automatiquement Vite)
- Cliquer "Deploy"

⚠️ Le premier déploiement va **échouer** — c'est normal, les variables d'environnement ne sont pas encore configurées.

### 4.3 Récupérer votre URL Vercel
Après le déploiement, notez votre URL : `https://evert-dossier-xxx.vercel.app`

### 4.4 Mettre à jour les URIs Google OAuth
Retourner dans Google Cloud Console → Identifiants → votre client OAuth
- Ajouter dans "Origines JavaScript autorisées" : `https://evert-dossier-xxx.vercel.app`
- Ajouter dans "URI de redirection" : `https://evert-dossier-xxx.vercel.app/api/auth/callback`
- Sauvegarder

---

## ÉTAPE 5 — Variables d'environnement Vercel (5 min)

Dans Vercel → votre projet → Settings → Environment Variables

Ajouter ces variables une par une :

| Variable | Valeur |
|----------|--------|
| `ANTHROPIC_API_KEY` | Votre clé Anthropic (sk-ant-...) |
| `GOOGLE_CLIENT_ID` | Client ID récupéré à l'étape 2.4 |
| `GOOGLE_CLIENT_SECRET` | Client Secret récupéré à l'étape 2.4 |
| `GOOGLE_REDIRECT_URI` | `https://votre-app.vercel.app/api/auth/callback` |
| `GOOGLE_DRIVE_FOLDER_ID` | L'ID du dossier Drive (étape 3.2) |
| `SESSION_SECRET` | Une chaîne aléatoire longue (ex: `evert2024secretsessionxyz789abc`) |
| `ALLOWED_DOMAIN` | `ever-t.com` |

### 5.1 Relancer le déploiement
→ Vercel → votre projet → Deployments → "Redeploy" sur le dernier déploiement

---

## ÉTAPE 6 — Test final

1. Ouvrir `https://votre-app.vercel.app`
2. Cliquer "Se connecter avec Google"
3. Se connecter avec un compte @ever-t.com
4. Uploader un CV PDF
5. Cliquer "Générer le dossier"
6. Vérifier que le dossier apparaît dans votre Google Drive

---

## En cas de problème

### "Accès refusé — compte @ever-t.com requis"
→ Vérifier que la variable `ALLOWED_DOMAIN` est bien `ever-t.com` (sans @)

### "Erreur Google Drive"
→ Vérifier que le compte connecté a bien accès au dossier Drive
→ Vérifier que `GOOGLE_DRIVE_FOLDER_ID` est correct

### "Erreur génération Claude"
→ Vérifier que `ANTHROPIC_API_KEY` commence bien par `sk-ant-`

### L'app ne charge pas
→ Vérifier les logs dans Vercel → Functions

---

## Pour les mises à jour futures

Toute modification du code se déploie automatiquement en faisant :
```bash
git add .
git commit -m "Description de la modification"
git push
```
Vercel redéploie automatiquement en 1-2 minutes.

---

## Architecture pour référence

```
evert-dossier/
├── src/                    → Frontend React (Vite)
│   ├── pages/
│   │   ├── LoginPage.jsx   → Page de connexion Google
│   │   └── AppPage.jsx     → Interface principale
│   ├── components/
│   │   ├── DossierPreview.jsx  → Rendu du dossier généré
│   │   └── ProtectedRoute.jsx  → Protection des routes
│   └── hooks/
│       └── useAuth.js      → Gestion de l'authentification
├── api/                    → Backend Vercel (Node.js)
│   ├── auth/
│   │   ├── login.js        → Redirection OAuth Google
│   │   ├── callback.js     → Réception token + session
│   │   ├── me.js           → Infos utilisateur connecté
│   │   └── logout.js       → Déconnexion
│   ├── generate.js         → Appel API Claude (PDF ou texte)
│   └── save-to-drive.js    → Création Google Doc dans Drive
├── .env.example            → Template variables d'environnement
├── vercel.json             → Config routing Vercel
└── DEPLOY.md               → Ce fichier
```

## Évolutions prévues (v2/v3)

- **Boond Manager** : brancher l'API Boond sur `api/sync-boond.js` pour pré-remplir les infos candidat
- **Historique** : ajouter une base de données légère (Vercel KV ou Supabase)
- **Templates** : plusieurs formats de dossiers selon le type de mission client
- **Notifications Slack** : alerter l'équipe quand un nouveau dossier est créé
