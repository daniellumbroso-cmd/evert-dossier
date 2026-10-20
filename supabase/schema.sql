-- Base de l'agent ever"T (Supabase / PostgreSQL).
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS).

-- ── Consultants : fiche structurée tirée de Boond, rafraîchie chaque nuit ─────
create table if not exists consultants (
  boond_id              text primary key,
  nom                   text not null,
  titre                 text,
  famille               text,                      -- voir api/_lib/metiers.js
  familles_secondaires  text[] not null default '{}',
  stack                 text[] not null default '{}',
  seniorite             text check (seniorite in ('junior','confirme','senior','expert')),
  annees_experience     int,
  secteurs              text[] not null default '{}',
  langues               text[] not null default '{}',
  localisation          text,
  mobilite              text[] not null default '{}',
  tjm                   int,
  intercontrat          boolean not null default false,
  fin_mission           date,                      -- fin de la mission en cours
  disponible_le         date,                      -- date de dispo saisie dans Boond
  resume                text,                      -- 2-3 phrases pour la relecture par Claude
  etat_boond            text,
  source_hash           text,                      -- empreinte des données Boond lues : évite de relancer Claude si rien n'a changé
  indexe_le             timestamptz not null default now(),
  maj_boond_le          timestamptz not null default now()
);
create index if not exists consultants_famille_idx on consultants (famille);
create index if not exists consultants_secondaires_idx on consultants using gin (familles_secondaires);
create index if not exists consultants_dispo_idx on consultants (intercontrat, fin_mission);

-- ── Offres : besoins Boond, alertes Collective (étape 2), saisies manuelles ──
create table if not exists offres (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null check (source in ('manuel','boond','collective','email')),
  source_ref            text,                      -- ID Boond, ID de l'alerte…
  titre                 text,
  texte                 text not null,
  famille               text,
  analyse               jsonb,                     -- offre structurée par Claude
  recue_le              timestamptz not null default now(),
  cree_par              text,
  unique (source, source_ref)
);
create index if not exists offres_recue_idx on offres (recue_le desc);

-- ── Matchs : classement d'une offre, en attente de validation humaine ────────
create table if not exists matchs (
  id                    uuid primary key default gen_random_uuid(),
  offre_id              uuid not null references offres(id) on delete cascade,
  boond_id              text not null references consultants(boond_id) on delete cascade,
  rang                  int not null,
  score                 int not null,              -- score final (après relecture Claude)
  score_calcule         int not null,              -- score pondéré avant relecture
  detail                jsonb,
  justification         text,
  ecarts                text[] not null default '{}',
  statut                text not null default 'a_valider' check (statut in ('a_valider','valide','ecarte','pousse')),
  cree_le               timestamptz not null default now(),
  unique (offre_id, boond_id)
);

-- ── RGPD : personnes à ne plus contacter (consulté avant tout push, étape 3) ─
create table if not exists ne_plus_contacter (
  email                 text primary key,
  raison                text,
  ajoute_le             timestamptz not null default now()
);

-- ── Journal des passages de l'agent (index de nuit, etc.) ────────────────────
create table if not exists agent_runs (
  id                    uuid primary key default gen_random_uuid(),
  tache                 text not null,
  debut                 timestamptz not null default now(),
  fin                   timestamptz,
  resultat              jsonb
);

-- Sécurité : sécurité par ligne activée et AUCUNE règle. Seule la clé
-- service_role (côté serveur Vercel) peut lire et écrire ; la clé anon ne voit rien.
alter table consultants        enable row level security;
alter table offres             enable row level security;
alter table matchs             enable row level security;
alter table ne_plus_contacter  enable row level security;
alter table agent_runs         enable row level security;

-- ── Étapes 2 à 4 : colonnes ajoutées (relançable sans risque) ────────────────
alter table offres add column if not exists lien            text;   -- lien vers l'offre (Collective…)
alter table offres add column if not exists entreprise      text;
alter table offres add column if not exists lieu            text;
alter table offres add column if not exists contact_email   text;   -- destinataire du push s'il est connu
alter table offres add column if not exists contact_nom     text;
alter table offres add column if not exists statut          text not null default 'nouvelle'
  check (statut in ('nouvelle','matchee','poussee','archivee'));

alter table matchs add column if not exists statut_par      text;   -- qui a validé / écarté
alter table matchs add column if not exists statut_le       timestamptz;
alter table matchs add column if not exists draft_id        text;   -- brouillon Gmail du push
alter table matchs add column if not exists pousse_a        text;
alter table matchs add column if not exists pousse_le       timestamptz;
