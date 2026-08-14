import React, { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updatePassword,
} from "firebase/auth";
import { db, auth, secondaryAuth } from "./firebase";

/* ---------------- Authentification & rôles ----------------
   Chaque compte (Firebase Authentication) a un document
   users/{uid} qui indique son rôle :
     { role: "famille", childIds: ["prenom-nom", ...] }
     { role: "Éducateur" | "Administrateur" | "Administrateur général", staffId: "staff-xxx" }
   Seul un administrateur général peut créer des comptes (voir
   GestionAcces et AjouterEnfant), via une session Firebase Auth
   secondaire pour ne pas déconnecter son propre compte.
------------------------------------------------------------- */
function useAuthProfile() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setTokenReady(false);
      if (u) {
        // Force un jeton d'authentification frais avant toute lecture
        // Firestore : juste après une connexion, le jeton mis en cache
        // côté client peut ne pas encore être valide côté serveur, ce qui
        // fait échouer les règles de sécurité ("Missing or insufficient
        // permissions") pendant quelques instants.
        try { await u.getIdToken(true); } catch (e) { /* on retente via Firestore de toute façon */ }
      }
      setAuthUser(u);
      setAuthLoading(false);
      setProfile(null);
      setTokenReady(true);
    });
    return () => unsub();
  }, []);

  const [profileRetryTick, setProfileRetryTick] = useState(0);
  const profileRetriesRef = useRef(0);

  useEffect(() => {
    if (!authUser || !tokenReady) return;
    setProfileLoading(true);
    const unsub = onSnapshot(
      doc(db, "users", authUser.uid),
      (snap) => { profileRetriesRef.current = 0; setProfile(snap.exists() ? snap.data() : null); setProfileLoading(false); },
      (err) => {
        if (err.code === "permission-denied" && profileRetriesRef.current < 2) {
          profileRetriesRef.current += 1;
          setTimeout(() => setProfileRetryTick((t) => t + 1), 1200);
          return;
        }
        setProfile(null); setProfileLoading(false);
      }
    );
    return () => unsub();
  }, [authUser, tokenReady, profileRetryTick]);

  return { authUser, authLoading, profile, profileLoading, tokenReady };
}

/* Crée un compte (famille ou staff) sans déconnecter l'administrateur
   actuellement connecté, grâce à l'app Firebase secondaire. */
async function createManagedAccount(email, password) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await signOut(secondaryAuth);
  return cred.user.uid;
}

/* ============================================================
   NEC ACADÉMIE — L'Aventure des Dragons — Prototype v3
============================================================ */

const COLORS = {
  bg: "#0A2532", bgDeep: "#071A24", panel: "#0F3548", panelLight: "#14415A",
  border: "#1E5170", gold: "#E8B84B", goldDim: "#C89A3C", text: "#F3EFE2",
  textDim: "#9FC0D1", green: "#6FCF97", red: "#EA6B5D",
};

const MAISON_META = {
  jardin: { name: "Jardin Aquatique & Boutchou", color: "#6FD6C7", short: "JA" },
  blanc: { name: "Dragon Blanc", color: "#E9EEF1", short: "DB" },
  jaune: { name: "Dragon Jaune & Collège", color: "#F2C94C", short: "DJ" },
  rouge: { name: "Dragon Rouge & Argent", color: "#E4572E", short: "DR" },
};

const DEFAULT_THEME = { ...COLORS };
const DEFAULT_MAISON_COLORS = { jardin: "#6FD6C7", blanc: "#E9EEF1", jaune: "#F2C94C", rouge: "#E4572E" };

const POS = [
  { id: "bonjour", label: "Dire bonjour", pts: 1 },
  { id: "heure", label: "Arriver à l'heure", pts: 1 },
  { id: "aide", label: "Aider un camarade", pts: 3 },
  { id: "rangement", label: "Bien ranger son matériel", pts: 2 },
  { id: "consignes", label: "Respecter les consignes", pts: 2 },
  { id: "exemplaire", label: "Séance exemplaire", pts: 2 },
];
const NEG = [
  { id: "retard", label: "Retard", pts: -1 },
  { id: "perturbation", label: "Perturbation du cours", pts: -4 },
  { id: "pousser", label: "Pousser un camarade", pts: -3 },
  { id: "nonrespect", label: "Non-respect", pts: -5 },
];
const ALL_MISSIONS = [...POS, ...NEG];

const PRODUCTS = [
  { id: "sticker", name: "Autocollant NEC", price: 100, stock: 40, emoji: "🔖" },
  { id: "stylo", name: "Stylo NEC", price: 150, stock: 30, emoji: "🖊️" },
  { id: "porteclef", name: "Porte-clés NEC", price: 200, stock: 25, emoji: "🔑" },
  { id: "nounours", name: "Nounours du club", price: 350, stock: 15, emoji: "🧸" },
  { id: "bonnet", name: "Bonnet Dragon", price: 400, stock: 20, emoji: "🐉" },
  { id: "gourde", name: "Gourde NEC", price: 600, stock: 18, emoji: "🥤" },
  { id: "teeshirt", name: "Tee-shirt NEC", price: 800, stock: 12, emoji: "👕" },
  { id: "bonachat", name: "Bon d'achat boutique", price: 1000, stock: 10, emoji: "🎟️" },
];

const BADGES = [
  { id: "podium", name: "Podium Internec", desc: "Terminer sur le podium à l'Internec", reward: "+5 à +15 selon le rang", emoji: "🥇" },
  { id: "supercopain", name: "Super Copain", desc: "Avoir aidé 20 camarades", reward: "+30", emoji: "🤝" },
  { id: "jamaisretard", name: "Jamais en retard", desc: "10 séances consécutives à l'heure", reward: "+15", emoji: "⏰" },
  { id: "perseverant", name: "Persévérant", desc: "80% de présence depuis l'inscription", reward: "+50", emoji: "🔥" },
  { id: "guerrier", name: "Guerrier", desc: "Participer à 100 séances", reward: "+100", emoji: "⚔️" },
  { id: "dauphinor", name: "Dauphin d'or", desc: "Posséder 1000 Tridents", reward: "+10", emoji: "🐬" },
  { id: "stage", name: "Aventurier des vacances", desc: "Participer à un stage pendant les vacances", reward: "+20", emoji: "🏕️" },
  { id: "benevole", name: "Bénévole", desc: "Participer à une manifestation ou action citoyenne du club", reward: "+30", emoji: "💛" },
  { id: "rangement", name: "Toujours prêt", desc: "Aucun oubli de matériel pendant 1 mois", reward: "+10", emoji: "🎒" },
  { id: "carnet", name: "Page validée", desc: "Valider une page du carnet de natation", reward: "+20", emoji: "📘" },
];

const CORRECTION_WINDOW_MS = 48 * 3600 * 1000;

function obtainedBadgeIds(child) {
  const set = new Set(child.badgesObtained || []);
  if (child.tridents >= 1000) set.add("dauphinor");
  return set;
}

function clampSeance(raw) { return Math.max(-10, Math.min(11, raw)); }
function fmtDate(d) { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }); }
function fmtDateTime(d) { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
function hoursLeft(from) { return Math.max(0, Math.round((CORRECTION_WINDOW_MS - (Date.now() - from)) / 3600000)); }
function activeEvent(events) {
  const now = Date.now();
  return (events || []).find((e) => now >= e.start && now <= e.end) || null;
}

/* ---------------- Seed data ---------------- */
function seedData() {
  const groups = [
    { id: "ja-a", maisonId: "jardin", name: "JA A", horaire: "Samedi 9h–9h45" },
    { id: "ja-b", maisonId: "jardin", name: "JA B", horaire: "Samedi 10h–10h45" },
    { id: "ja-c", maisonId: "jardin", name: "JA C", horaire: "Mercredi 14h30–15h15" },
    { id: "db-a", maisonId: "blanc", name: "DB A", horaire: "Mercredi 10h–11h" },
    { id: "db-c", maisonId: "blanc", name: "DB C", horaire: "Mercredi 17h–18h" },
    { id: "dj-a", maisonId: "jaune", name: "DJ A", horaire: "Mardi 18h–19h" },
    { id: "dj-b", maisonId: "jaune", name: "DJ B", horaire: "Jeudi 18h30–19h30" },
    { id: "dr-a", maisonId: "rouge", name: "DR A", horaire: "Lundi 19h–20h" },
    { id: "dr-b", maisonId: "rouge", name: "DR B", horaire: "Vendredi 19h30–20h30" },
  ];

  const mk = (prenom, nom, age, groupId, maisonId, tridents, badgeCount, hist) => ({
    id: `${prenom}-${nom}`.toLowerCase(),
    prenom, nom, age, groupId, maisonId, tridents,
    badgesObtained: BADGES.slice(0, badgeCount).map((b) => b.id),
    historique: hist,
    settings: { notifications: true, email: `${prenom.toLowerCase()}.${nom.toLowerCase()}@famille-nec.fr` },
  });

  const daysAgo = (n) => Date.now() - n * 86400000;

  const children = [
    mk("Lucas", "Martin", 6, "ja-a", "jardin", 42, 2, [{ date: daysAgo(3), delta: 2, label: "Respect des consignes" }, { date: daysAgo(6), delta: 1, label: "Arriver à l'heure" }]),
    mk("Emma", "Bernard", 6, "ja-a", "jardin", 58, 3, [{ date: daysAgo(2), delta: 3, label: "A aidé un camarade" }, { date: daysAgo(9), delta: 1, label: "Dire bonjour" }]),
    mk("Thomas", "Petit", 7, "ja-b", "jardin", 30, 1, [{ date: daysAgo(4), delta: -1, label: "Retard" }]),
    mk("Chloé", "Robert", 8, "db-a", "blanc", 96, 4, [{ date: daysAgo(1), delta: 2, label: "Bien ranger son matériel" }, { date: daysAgo(5), delta: 3, label: "A aidé un camarade" }]),
    mk("Léo", "Richard", 8, "db-a", "blanc", 74, 2, [{ date: daysAgo(3), delta: -4, label: "Perturbation du cours" }]),
    mk("Manon", "Durand", 9, "db-c", "blanc", 120, 5, [{ date: daysAgo(2), delta: 2, label: "Séance exemplaire" }]),
    mk("Nathan", "Moreau", 10, "dj-a", "jaune", 165, 6, [{ date: daysAgo(1), delta: 3, label: "A aidé un camarade" }, { date: daysAgo(7), delta: 2, label: "Respect des consignes" }]),
    mk("Camille", "Simon", 10, "dj-a", "jaune", 88, 3, [{ date: daysAgo(4), delta: 1, label: "Dire bonjour" }]),
    mk("Sacha", "Michel", 11, "dj-b", "jaune", 210, 7, [{ date: daysAgo(2), delta: 2, label: "Bien ranger son matériel" }]),
    mk("Léa", "Lefevre", 11, "dj-b", "jaune", 54, 2, [{ date: daysAgo(6), delta: -1, label: "Retard" }]),
    mk("Enzo", "Garcia", 12, "dr-a", "rouge", 247, 8, [{ date: daysAgo(1), delta: 2, label: "Respect des consignes" }, { date: daysAgo(3), delta: 3, label: "A aidé un camarade" }]),
    mk("Jade", "David", 13, "dr-a", "rouge", 189, 5, [{ date: daysAgo(2), delta: -3, label: "Pousser un camarade" }]),
    mk("Noah", "Bertrand", 13, "dr-b", "rouge", 301, 9, [{ date: daysAgo(1), delta: 2, label: "Séance exemplaire" }]),
    mk("Lina", "Roux", 14, "dr-b", "rouge", 143, 4, [{ date: daysAgo(5), delta: 1, label: "Arriver à l'heure" }]),
  ];

  const maisons = {};
  Object.keys(MAISON_META).forEach((id) => {
    const pts = children.filter((c) => c.maisonId === id).reduce((s, c) => s + c.tridents * 10, 0);
    maisons[id] = { id, points: pts };
  });

  const products = PRODUCTS.map((p) => ({ ...p, image: "" }));
  const actualites = [
    { id: "a1", title: "La boutique ouvre bientôt", text: "N'oubliez pas de réserver vos lots dès l'ouverture !", date: daysAgo(1) },
    { id: "a2", title: "Podium à l'Internec ce week-end", text: "Des Tridents bonus pour les 3 premiers de chaque catégorie.", date: daysAgo(4) },
  ];
  const staff = [
    { id: "hugo", prenom: "Hugo", nom: "Lambert", email: "hugo.lambert@nec-natation.fr", role: "Administrateur général" },
    { id: "sarah", prenom: "Sarah", nom: "Dubois", email: "sarah.dubois@nec-natation.fr", role: "Éducateur" },
  ];

  return {
    groups, children, maisons, products, orders: [], actualites,
    boutiqueOuverte: true,
    seances: [],
    events: [],
    season: { number: 1, startDate: daysAgo(30) },
    seasonsArchive: [],
    theme: { ...DEFAULT_THEME, brandRed: BRAND.red, loginBg: "#FFFFFF" },
    maisonColors: { ...DEFAULT_MAISON_COLORS },
    staff,
    logoImageLight: "",
    logoImageDark: "",
  };
}

/* ---------------- Persistence (Firebase Firestore) ----------------
   Toutes les données de l'application sont stockées dans UN SEUL
   document Firestore : necAcademie/data
   onSnapshot() écoute ce document en temps réel : dès qu'un appareil
   modifie une donnée (persist), tous les autres appareils connectés
   reçoivent automatiquement la mise à jour, sans rechargement.
------------------------------------------------------------------- */
const DATA_DOC = doc(db, "necAcademie", "data");

function normalize(parsed) {
  if (!parsed.theme) parsed.theme = { ...DEFAULT_THEME };
  if (!parsed.maisonColors) parsed.maisonColors = { ...DEFAULT_MAISON_COLORS };
  if (!parsed.staff) parsed.staff = [{ id: "hugo", prenom: "Hugo", nom: "Lambert", email: "hugo.lambert@nec-natation.fr", role: "Administrateur général" }];
  if (parsed.logoImage === undefined && parsed.logoImageLight === undefined) { parsed.logoImageLight = ""; parsed.logoImageDark = ""; }
  if (parsed.logoImageLight === undefined) parsed.logoImageLight = parsed.logoImage || "";
  if (parsed.logoImageDark === undefined) parsed.logoImageDark = "";
  if (!parsed.theme.brandRed) parsed.theme.brandRed = BRAND.red;
  if (!parsed.theme.loginBg) parsed.theme.loginBg = "#FFFFFF";
  parsed.children.forEach((c) => { if (!c.badgesObtained) c.badgesObtained = BADGES.slice(0, c.badges || 0).map((b) => b.id); });
  parsed.products.forEach((p) => { if (p.image === undefined) p.image = ""; });
  return parsed;
}

function useAppData(authUser) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const creatingRef = useRef(false);
  const [retryTick, setRetryTick] = useState(0);
  const retriesRef = useRef(0);

  useEffect(() => {
    // On n'écoute Firestore qu'une fois la personne authentifiée : les
    // règles de sécurité exigent désormais un compte connecté.
    if (!authUser) { setData(null); setLoading(true); setError(null); return; }
    creatingRef.current = false;
    const unsubscribe = onSnapshot(
      DATA_DOC,
      async (snap) => {
        retriesRef.current = 0;
        if (snap.exists()) {
          setData(normalize(snap.data()));
          setLoading(false);
        } else if (!creatingRef.current) {
          // Le document n'existe pas encore (premier lancement) : on le crée.
          creatingRef.current = true;
          try {
            const seed = seedData();
            await setDoc(DATA_DOC, seed);
            // onSnapshot se redéclenchera automatiquement avec les données créées.
          } catch (e) {
            setError(e);
            setLoading(false);
          }
        }
      },
      (err) => {
        // Juste après une connexion, Firestore peut refuser une première
        // tentative le temps que le jeton d'authentification se propage
        // pleinement côté serveur. On retente automatiquement 2 fois avant
        // d'afficher une vraie erreur à la personne.
        if (err.code === "permission-denied" && retriesRef.current < 2) {
          retriesRef.current += 1;
          setTimeout(() => setRetryTick((t) => t + 1), 1200);
          return;
        }
        console.error("Erreur Firestore :", err);
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [authUser, retryTick]);

  const persist = useCallback(async (next) => {
    setData(next);
    try {
      await setDoc(DATA_DOC, next);
    } catch (e) {
      console.error("Erreur d'enregistrement Firestore :", e);
    }
  }, []);

  return { data, loading, error, persist };
}

/* ---------------- Small UI atoms ---------------- */
function TridentIcon({ size = 18, color = COLORS.gold }) {
  return <span style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}>🔱</span>;
}
function Chip({ children, color, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999,
      background: color ? `${color}22` : COLORS.panelLight, color: color || COLORS.text, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color ? color + "55" : COLORS.border}`, ...style }}>
      {children}
    </span>
  );
}
function GaugeTrident({ value, target = 500 }) {
  const pct = Math.max(0.04, Math.min(1, value / target));
  return (
    <div style={{ position: "relative", width: 86, height: 120 }}>
      <svg viewBox="0 0 86 120" width="86" height="120">
        <defs><clipPath id="tridentClip">
          <path d="M40 6 V112 M40 6 C34 20 24 30 14 34 M40 6 C46 20 56 30 66 34 M28 2 C28 18 34 28 40 34 M52 2 C52 18 46 28 40 34 M28 108 H52" stroke="black" strokeWidth="9" fill="none" strokeLinecap="round" />
        </clipPath></defs>
        <path d="M40 6 V112 M40 6 C34 20 24 30 14 34 M40 6 C46 20 56 30 66 34 M28 2 C28 18 34 28 40 34 M52 2 C52 18 46 28 40 34 M28 108 H52" stroke={COLORS.border} strokeWidth="9" fill="none" strokeLinecap="round" />
        <g clipPath="url(#tridentClip)"><rect x="0" y={120 - 120 * pct} width="86" height={120 * pct} fill={COLORS.gold} /></g>
        <path d="M40 6 V112 M40 6 C34 20 24 30 14 34 M40 6 C46 20 56 30 66 34 M28 2 C28 18 34 28 40 34 M52 2 C52 18 46 28 40 34 M28 108 H52" stroke={COLORS.goldDim} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  );
}
function PodiumChart({ ranked, max }) {
  const medals = ["🥇", "🥈", "🥉", "4ᵉ"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 20 }}>
      {ranked.map((m, i) => {
        const h = Math.max(10, (m.points / max) * 110);
        return (
          <div key={m.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}>{medals[i]}</div>
            <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.points}</div>
            <div style={{ width: "100%", maxWidth: 50, height: h, background: MAISON_META[m.id].color, borderRadius: "8px 8px 0 0", transition: "height .5s ease" }} />
            <div style={{ color: COLORS.textDim, fontSize: 10.5, marginTop: 6, fontWeight: 600 }}>{MAISON_META[m.id].short}</div>
          </div>
        );
      })}
    </div>
  );
}

function WaveBar({ pct, color }) {
  return (
    <div style={{ height: 14, borderRadius: 999, background: COLORS.panelLight, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
      <div style={{ width: `${Math.max(3, pct)}%`, height: "100%", background: color, transition: "width .6s ease" }} />
    </div>
  );
}
function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const base = { padding: "10px 16px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
    border: "none", opacity: disabled ? 0.5 : 1, transition: "filter .15s ease", fontFamily: "'Inter', sans-serif" };
  const variants = {
    primary: { background: COLORS.gold, color: COLORS.bgDeep },
    ghost: { background: "transparent", color: COLORS.text, border: `1px solid ${COLORS.border}` },
    danger: { background: COLORS.red, color: "#fff" },
  };
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = "brightness(1.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
      style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}
function Card({ children, style }) {
  return <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 18, ...style }}>{children}</div>;
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer",
      background: on ? COLORS.gold : COLORS.panelLight, position: "relative", transition: "background .2s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
        background: on ? COLORS.bgDeep : COLORS.textDim, transition: "left .2s" }} />
    </button>
  );
}

/* ============================================================
   LOGIN
============================================================ */
const BRAND = { red: "#B3271F", redDim: "#8C1F19", black: "#111111", white: "#FFFFFF", grey: "#E7E7E7" };

const LOGO_LIGHT_DEFAULT = "data:image/png;base64,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";
const LOGO_DARK_DEFAULT = "data:image/png;base64,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Db/fj6ZpCTBZrTYyMzNQVRPBYID6+ga0WJyaoghMZgt2my3ZDB0DByIaihMMhdLP7qeqqkynl6IoUiDktGk3y1AoJN988y25//77S5fLLe12hywoKJTnnnuuXLRokfz++3myoKBQqqoqX3nlZfnCCy9Ii8UiFUVJ/B4g/3DxxfKrr76SgwYNkkDzfYSQjz36qFy+bLm87bb/S3wWv664uER+++238oILLkj6rPmlSEDuu+++8q+vvirXr1svq6qqZWVllVy0aJG84447ZF5evoydDXL48OHyu+++k0uXLpFXXXWVBKLPoQhpt9vlG2+8IZ977nkJSJvNLl988UW5dOlS+cILL0i73SGFEIlnu+aaa+UXX3whCwoKE88mhJAul0u+++67cvmyZfKqK6+KfaYkrjv++BPk/Pnz5f777y8B6XZnyGuvvVbOnfutXL9+gyzbuFGuXr1GfvrpZ/KGG26Q+QUFEpCnnnqqXLRwkVy2bJlcvnx54rVi+XK5atUqec0117QzR337lXZKejQjbgJ333U3b7zxJpdedilai6hOv9/HO++8w1dffc3AgQMT4SYjR46KRufqepuw6/z8AibsOwGr1Zp0n6MnT+byK65g3br13HLLND75ZBbz5zdnNlqsFiZMmEBhQWE7nEPnmGOO5Y033qC2tpZHHn2UVatWYTGbmXjkRG655RYmHTWJ3/3ud5RvK8dutzNu3DiqqqqZPn0669at56OPZibEsdGjRlEf4yyKIhg9ejRFRUWcd955VFfXcPvt/4eMja2kpIRx48Y3e95llHv87nfncdppp7FxYxk33nQTMz78kLKy0sSYsrOzmDBhAi6XC4Abb7iBW269lWeeeYZ5874nokXIyc7hiCMm8qtf/YqPP/6Yim3byMvNY5+x+/DnP9/H2rVrUE2mmGgVjXieP39+mwxKw4q1g2jixImYTCZeffWvaJFISuvSli2b2bJlMwIwWyyEw2FURSUnJycpAy0SiWCz2QmFQwnxQEqJxWLh1mm3sHLVKs4/7zw++OADbrvtNn7zm980K+sSwuFwypB7XddxuVz8+c/3Ultbw/HHn8DGjc0xSDM/msm3337Hv/71T/546aX8+c/3RvUqKXn00UeZOHEizz//HCeccCLLly8DIByJJEfhCsHcud8yZ84cHnxwOiuWL+f1N16PgTMSy52PjkmT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";

function BrandTridentMark({ size = 60, invert = false, logoImage }) {
  const fg = invert ? BRAND.white : BRAND.red;
  const bg = invert ? BRAND.black : BRAND.white;
  const src = logoImage || (invert ? LOGO_DARK_DEFAULT : LOGO_LIGHT_DEFAULT);
  if (src) {
    return (
      <div style={{ width: size, height: size, background: bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: invert ? "none" : `1px solid ${BRAND.grey}`, overflow: "hidden" }}>
        <img src={src} alt="Logo NEC" style={{ width: "82%", height: "82%", objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, background: bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: invert ? "none" : `1px solid ${BRAND.grey}` }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M12 2v17" stroke={fg} strokeWidth="2" strokeLinecap="round" />
        <path d="M5 2c0 3.5 2 5.8 4 6.8M19 2c0 3.5-2 5.8-4 6.8" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 1c0 4 1.6 6.2 3.4 7.2M21 1c0 4-1.6 6.2-3.4 7.2" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 21h8" stroke={fg} strokeWidth="2" strokeLinecap="round" />
        <path d="M4 15c3 1.4 13 1.4 16 0" stroke={fg} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  );
}

function LoginField({ icon, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${BRAND.black}`, padding: "6px 2px", marginBottom: 18 }}>
      <span style={{ color: BRAND.red, fontSize: 15 }}>{icon}</span>
      <input type={type} placeholder={placeholder} style={{ border: "none", outline: "none", flex: 1, fontSize: 13, color: BRAND.black, background: "transparent" }} />
    </div>
  );
}

function Login({ logoLight, logoDark, bgColor }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const messageFor = (code) => ({
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/user-not-found": "Aucun compte ne correspond à cet e-mail.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives, réessayez dans quelques minutes.",
  }[code] || "Connexion impossible. Vérifiez vos identifiants.");

  const valider = async () => {
    if (!email.trim() || !password) return;
    setErr(""); setInfo(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setErr(messageFor(e.code));
    } finally { setBusy(false); }
  };

  const motDePasseOublie = async () => {
    if (!email.trim()) { setErr("Indiquez d'abord votre e-mail ci-dessus."); return; }
    setErr(""); setInfo(""); setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("E-mail de réinitialisation envoyé, si ce compte existe.");
    } catch (e) {
      setErr(messageFor(e.code));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: bgColor || BRAND.white, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 900, marginBottom: 40, flexWrap: "wrap", gap: 20 }}>
        <BrandTridentMark size={70} logoImage={logoLight} />
        <div style={{ border: `2px solid ${BRAND.red}`, borderRadius: 10, padding: "14px 32px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 24, color: BRAND.red, letterSpacing: 1, textTransform: "uppercase" }}>NEC Académie</div>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 600, fontSize: 15, color: BRAND.red, fontStyle: "italic" }}>L'aventure des dragons</div>
        </div>
        <BrandTridentMark size={70} invert logoImage={logoDark} />
      </div>

      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 20, color: "#333", marginBottom: 30 }}>Connexion</div>

      <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${BRAND.black}`, padding: "6px 2px", marginBottom: 18 }}>
          <span style={{ color: BRAND.red, fontSize: 15 }}>✉️</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} type="email" placeholder="Adresse e-mail" style={{ border: "none", outline: "none", flex: 1, fontSize: 13, color: BRAND.black, background: "transparent" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${BRAND.black}`, padding: "6px 2px", marginBottom: 18 }}>
          <span style={{ color: BRAND.red, fontSize: 15 }}>🔑</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} type="password" placeholder="Mot de passe" style={{ border: "none", outline: "none", flex: 1, fontSize: 13, color: BRAND.black, background: "transparent" }} />
        </div>
        {err && <div style={{ color: BRAND.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
        {info && <div style={{ color: "#2a7", fontSize: 12, marginBottom: 10 }}>{info}</div>}
        <button onClick={valider} disabled={busy || !email.trim() || !password} style={{ padding: "10px 34px", borderRadius: 10, border: `2px solid ${BRAND.red}`, background: BRAND.white, color: BRAND.black, fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Valider"}</button>
        <div style={{ marginTop: 14 }}>
          <button onClick={motDePasseOublie} disabled={busy} style={{ background: "none", border: "none", color: "#888", fontSize: 11.5, textDecoration: "underline", cursor: "pointer" }}>Mot de passe oublié ?</button>
        </div>
        <div style={{ color: "#999", fontSize: 11, marginTop: 14 }}>Comptes créés par l'administrateur du club (famille, éducateur, administrateur)</div>
      </div>

      <div style={{ marginTop: 48, color: "#bbb", fontSize: 11 }}>Nautique Entente Châlonnaise</div>
    </div>
  );
}

/* ============================================================
   SHELL
============================================================ */
function Shell({ title, subtitle, tabs, active, onTab, onLogout, children, banner }) {
  const [mobileNav, setMobileNav] = useState(false);
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: COLORS.bg, fontFamily: "'Inter', sans-serif" }}>
      <div className="hidden md:flex" style={{ width: 220, flexDirection: "column", background: COLORS.bgDeep, borderRight: `1px solid ${COLORS.border}`, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 20px" }}>
          <TridentIcon size={24} />
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, color: COLORS.text, fontSize: 15 }}>NEC Académie</div>
        </div>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            padding: "10px 12px", borderRadius: 10, marginBottom: 4, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
            background: active === t.id ? COLORS.panelLight : "transparent", color: active === t.id ? COLORS.gold : COLORS.textDim }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onLogout} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textDim, fontSize: 12.5, cursor: "pointer" }}>← Changer de compte</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {banner}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 700, fontSize: 19, color: COLORS.text }}>{title}</div>
            {subtitle && <div style={{ color: COLORS.textDim, fontSize: 12.5 }}>{subtitle}</div>}
          </div>
          <button className="md:hidden" onClick={() => setMobileNav((v) => !v)} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>☰ Menu</button>
        </div>

        {mobileNav && (
          <div className="md:hidden" style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: "flex", flexWrap: "wrap", gap: 8, background: COLORS.bgDeep }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => { onTab(t.id); setMobileNav(false); }} style={{ padding: "8px 12px", borderRadius: 10, border: "none", fontSize: 12.5, fontWeight: 600,
                background: active === t.id ? COLORS.panelLight : COLORS.panel, color: active === t.id ? COLORS.gold : COLORS.textDim }}>{t.icon} {t.label}</button>
            ))}
            <button onClick={onLogout} style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textDim, fontSize: 12.5 }}>← Compte</button>
          </div>
        )}
        <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function EventBanner({ event }) {
  if (!event) return null;
  return (
    <div style={{ background: `linear-gradient(90deg, ${COLORS.goldDim}, ${COLORS.gold})`, color: COLORS.bgDeep, padding: "8px 20px", fontSize: 12.5, fontWeight: 700, textAlign: "center" }}>
      ⚡ Événement en cours : {event.name} — Tridents gagnés x{event.multiplier} jusqu'au {fmtDate(event.end)}
    </div>
  );
}

/* ============================================================
   ESPACE FAMILLE
============================================================ */
function ChildPicker({ children, onPick, onBack }) {
  return (
    <div style={{ minHeight: "100vh", padding: 24, background: COLORS.bg }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.textDim, marginBottom: 16, cursor: "pointer", fontSize: 13 }}>← Retour</button>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", color: COLORS.text, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Qui se connecte ?</div>
      <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 20 }}>Choisissez un profil pour la démonstration</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12, maxWidth: 900 }}>
        {children.map((c) => {
          const m = MAISON_META[c.maisonId];
          return (
            <button key={c.id} onClick={() => onPick(c.id)} style={{ textAlign: "left", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: COLORS.bgDeep, marginBottom: 10 }}>{c.prenom[0]}</div>
              <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{c.prenom} {c.nom}</div>
              <div style={{ color: COLORS.textDim, fontSize: 11.5, marginTop: 2 }}>{m.short} · {c.tridents} <TridentIcon size={10} /></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccueilFamille({ child, rank, evolWeek, maison, actualites }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <GaugeTrident value={child.tridents} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 22, color: COLORS.text, fontWeight: 700 }}>Bonjour {child.prenom} 👋</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Chip color={COLORS.gold}><TridentIcon size={12} /> {child.tridents} Tridents</Chip>
            <Chip color={maison.color}>🏠 {maison.name}</Chip>
            <Chip color={COLORS.gold}>🏆 {rank}ᵉ place</Chip>
            <Chip color={evolWeek >= 0 ? COLORS.green : COLORS.red}>{evolWeek >= 0 ? "📈 +" : "📉 "}{evolWeek} cette semaine</Chip>
            <Chip>🏅 {obtainedBadgeIds(child).size} badges</Chip>
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Actualités du club</div>
        {actualites.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucune actualité pour le moment.</div>}
        {actualites.slice(0, 4).map((a, i) => (
          <div key={a.id} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
            <div style={{ color: COLORS.text, fontSize: 13.5, fontWeight: 600 }}>{a.title}</div>
            <div style={{ color: COLORS.textDim, fontSize: 12 }}>{a.text}</div>
            <div style={{ color: COLORS.textDim, fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>{fmtDate(a.date)}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function MonProfilFamille({ child, group, maison }) {
  const obtenus = BADGES.filter((b) => obtainedBadgeIds(child).has(b.id));
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <Card style={{ textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: maison.color, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: COLORS.bgDeep }}>{child.prenom[0]}{child.nom[0]}</div>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 19, color: COLORS.text, fontWeight: 700 }}>{child.prenom} {child.nom}</div>
        <div style={{ color: COLORS.textDim, fontSize: 12.5, marginTop: 2 }}>{child.age} ans · Groupe {group?.name}</div>
      </Card>
      <Card style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
        <div><div style={{ color: COLORS.gold, fontSize: 22, fontWeight: 800 }}>{child.tridents}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Tridents</div></div>
        <div><div style={{ color: COLORS.text, fontSize: 22, fontWeight: 800 }}>{obtenus.length}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Badges</div></div>
        <div><div style={{ color: maison.color, fontSize: 22, fontWeight: 800 }}>{maison.short}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Maison</div></div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Mes badges</div>
        {obtenus.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucun badge obtenu pour l'instant.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {obtenus.map((b) => (
            <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: COLORS.panelLight, borderRadius: 10 }}>
              <div style={{ fontSize: 20 }}>{b.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.gold, fontSize: 13, fontWeight: 700 }}>{b.name}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11.5, marginTop: 2 }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8, fontFamily: "'Baloo 2', sans-serif" }}>Derniers gains</div>
        {child.historique.slice(0, 3).map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
            <span style={{ color: COLORS.textDim }}>{h.label}</span>
            <span style={{ color: h.delta >= 0 ? COLORS.green : COLORS.red, fontWeight: 700 }}>{h.delta > 0 ? "+" : ""}{h.delta}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function MaMaisonFamille({ child, maisons, seasonsArchive }) {
  const ranked = Object.values(maisons).sort((a, b) => b.points - a.points);
  const max = ranked[0]?.points || 1;
  const myRank = ranked.findIndex((m) => m.id === child.maisonId) + 1;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <Card>
        <div style={{ color: COLORS.textDim, fontSize: 12 }}>Ma maison</div>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 20, fontWeight: 700, color: MAISON_META[child.maisonId].color }}>{MAISON_META[child.maisonId].name}</div>
        <div style={{ marginTop: 6, color: COLORS.text, fontSize: 13 }}>{myRank}ᵉ place — <b>{maisons[child.maisonId].points}</b> points</div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Classement des maisons</div>
        <PodiumChart ranked={ranked} max={max} />
        <div style={{ marginTop: 14 }}>
        {ranked.map((m, i) => (
          <div key={m.id} style={{ marginBottom: 12, opacity: m.id === child.maisonId ? 1 : 0.75 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: COLORS.text, fontWeight: m.id === child.maisonId ? 700 : 500 }}>{i + 1}. {MAISON_META[m.id].name}</span>
              <span style={{ color: COLORS.textDim }}>{m.points} pts</span>
            </div>
            <WaveBar pct={(m.points / max) * 100} color={MAISON_META[m.id].color} />
          </div>
        ))}
        </div>
      </Card>
      {seasonsArchive.length > 0 && (
        <Card>
          <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Saisons précédentes</div>
          {seasonsArchive.map((s) => (
            <div key={s.number} style={{ padding: "8px 0", borderTop: `1px solid ${COLORS.border}`, fontSize: 12.5 }}>
              <div style={{ color: COLORS.text, fontWeight: 600 }}>Saison {s.number} — vainqueur : {MAISON_META[s.winnerId]?.name}</div>
              <div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</div>
            </div>
          ))}
        </Card>
      )}
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Ma contribution</div>
        <div style={{ color: COLORS.textDim, fontSize: 12.5 }}>{child.prenom} a rapporté <b style={{ color: COLORS.gold }}>{child.tridents * 10} points</b> à sa maison cette saison.</div>
      </Card>
    </div>
  );
}

function HistoriqueFamille({ child }) {
  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 12, fontFamily: "'Baloo 2', sans-serif" }}>Historique</div>
      {child.historique.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucun événement pour le moment.</div>}
      {child.historique.map((h, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}>
          <div><div style={{ color: COLORS.text, fontSize: 13 }}>{h.label}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDate(h.date)}</div></div>
          <div style={{ color: h.delta >= 0 ? COLORS.green : COLORS.red, fontWeight: 700, fontSize: 14 }}>{h.delta > 0 ? "+" : ""}{h.delta} <TridentIcon size={11} color={h.delta >= 0 ? COLORS.green : COLORS.red} /></div>
        </div>
      ))}
    </Card>
  );
}

function BoutiqueFamille({ data, child, persist }) {
  const myOrders = data.orders.filter((o) => o.childId === child.id);
  const reserved = myOrders.filter((o) => o.status === "attente").reduce((s, o) => s + o.price, 0);
  const disponible = child.tridents - reserved;
  const reserve = (product) => {
    if (!data.boutiqueOuverte || product.stock <= 0 || disponible < product.price) return;
    const next = JSON.parse(JSON.stringify(data));
    next.orders.unshift({ id: `cmd-${Date.now()}`, childId: child.id, childName: `${child.prenom} ${child.nom}`, productId: product.id, productName: product.name, price: product.price, date: Date.now(), status: "attente" });
    persist(next);
  };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!data.boutiqueOuverte && <Card style={{ borderColor: COLORS.red }}><div style={{ color: COLORS.red, fontWeight: 700, fontSize: 13 }}>La boutique est actuellement fermée. Revenez lors de la prochaine période d'ouverture.</div></Card>}
      <Card style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ color: COLORS.text, fontSize: 13 }}>Tridents disponibles</div>
        <Chip color={COLORS.gold}><TridentIcon size={12} /> {disponible} / {child.tridents}</Chip>
        {reserved > 0 && <span style={{ color: COLORS.textDim, fontSize: 11.5 }}>({reserved} en attente de validation)</span>}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
        {data.products.map((p) => {
          const canBuy = data.boutiqueOuverte && p.stock > 0 && disponible >= p.price;
          return (
            <Card key={p.id} style={{ textAlign: "center" }}>
              {p.image ? (
                <img src={p.image} alt={p.name} style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 8 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div style={{ fontSize: 30 }}>{p.emoji}</div>
              )}
              <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 13, marginTop: 6 }}>{p.name}</div>
              <div style={{ color: COLORS.gold, fontWeight: 700, fontSize: 13, marginTop: 2 }}>{p.price} <TridentIcon size={10} /></div>
              <div style={{ color: p.stock > 0 ? COLORS.textDim : COLORS.red, fontSize: 11, marginTop: 2 }}>{p.stock > 0 ? `${p.stock} en stock` : "Épuisé"}</div>
              <Btn style={{ width: "100%", marginTop: 10 }} disabled={!canBuy} onClick={() => reserve(p)}>Réserver</Btn>
            </Card>
          );
        })}
      </div>
      {myOrders.length > 0 && (
        <Card>
          <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8, fontFamily: "'Baloo 2', sans-serif" }}>Mes commandes</div>
          {myOrders.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ color: COLORS.text }}>{o.productName}</span>
              <Chip color={o.status === "validée" ? COLORS.green : COLORS.gold}>{o.status === "validée" ? "Validée — à retirer" : "En attente"}</Chip>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function BadgesFamille({ child }) {
  const obtainedIds = obtainedBadgeIds(child);
  const obtenus = BADGES.filter((b) => obtainedIds.has(b.id));
  const aVenir = BADGES.filter((b) => !obtainedIds.has(b.id));
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Badges obtenus ({obtenus.length})</div>
        <div style={{ display: "grid", gap: 8 }}>
          {obtenus.map((b) => (
            <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: COLORS.panelLight, border: `1px solid ${COLORS.goldDim}`, borderRadius: 10 }}>
              <div style={{ fontSize: 22 }}>{b.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.gold, fontSize: 13, fontWeight: 700 }}>{b.name}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11.5, marginTop: 2 }}>{b.desc}</div>
              </div>
              <Chip color={COLORS.gold}>{b.reward}</Chip>
            </div>
          ))}
          {obtenus.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucun badge obtenu pour l'instant.</div>}
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Badges &amp; défis à venir</div>
        <div style={{ display: "grid", gap: 8 }}>
          {aVenir.map((b) => (
            <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", background: COLORS.panelLight, borderRadius: 10, opacity: 0.85 }}>
              <div style={{ fontSize: 20 }}>{b.emoji}</div>
              <div style={{ flex: 1 }}><div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{b.name}</div><div style={{ color: COLORS.textDim, fontSize: 11.5 }}>{b.desc}</div></div>
              <Chip color={COLORS.gold}>{b.reward}</Chip>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AideFamille() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Comment ça marche ?</div>
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: COLORS.textDim, lineHeight: 1.5 }}>
          <div><b style={{ color: COLORS.gold }}>🔱 Les Tridents</b> — une monnaie individuelle gagnée ou perdue en séance selon le comportement. Le solde ne descend jamais sous zéro et repart à zéro à chaque nouvelle saison.</div>
          <div><b style={{ color: COLORS.text }}>🐉 Les Maisons</b> — chaque enfant appartient à une Maison fixe selon son niveau. 1 Trident gagné ou perdu = 10 points pour la Maison.</div>
          <div><b style={{ color: COLORS.text }}>🏆 Le classement</b> — les Maisons s'affrontent tout au long de la saison grâce aux Tridents cumulés de leurs membres.</div>
          <div><b style={{ color: COLORS.text }}>⚡ Les événements</b> — pendant certaines périodes annoncées par le club (ex. Double Tridents), les gains sont multipliés.</div>
          <div><b style={{ color: COLORS.text }}>🛍️ La boutique</b> — les Tridents peuvent être échangés contre des goodies du club pendant les périodes d'ouverture.</div>
          <div><b style={{ color: COLORS.text }}>🏅 Les badges</b> — des récompenses spéciales débloquées automatiquement en atteignant certains objectifs.</div>
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6, fontFamily: "'Baloo 2', sans-serif" }}>Une question, un problème ?</div>
        <a href="mailto:contact@nec-natation.fr" style={{ color: COLORS.gold, fontSize: 13, textDecoration: "none" }}>✉️ contact@nec-natation.fr</a>
      </Card>
    </div>
  );
}

function ParametresFamille({ child, data, persist }) {
  const toggleNotif = (val) => {
    const next = JSON.parse(JSON.stringify(data));
    next.children.find((c) => c.id === child.id).settings.notifications = val;
    persist(next);
  };
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 12, fontFamily: "'Baloo 2', sans-serif" }}>Informations personnelles</div>
        <div style={{ display: "grid", gap: 10 }}>
          {[["Prénom", child.prenom], ["Nom", child.nom], ["E-mail", child.settings.email], ["Mot de passe", "••••••••"]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: COLORS.textDim, fontSize: 12.5 }}>{label}</span><span style={{ color: COLORS.text, fontSize: 13 }}>{val}</span>
            </div>
          ))}
        </div>
        <Btn variant="ghost" style={{ marginTop: 12, width: "100%" }}>Modifier mes informations</Btn>
      </Card>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>Notifications</div><div style={{ color: COLORS.textDim, fontSize: 11.5 }}>Gains de Tridents, badges, boutique…</div></div>
          <Toggle on={child.settings.notifications} onChange={toggleNotif} />
        </div>
      </Card>
    </div>
  );
}

function FamilleApp({ data, persist, childId, onLogout }) {
  const [tab, setTab] = useState("accueil");
  const child = data.children.find((c) => c.id === childId);
  const group = data.groups.find((g) => g.id === child.groupId);
  const maison = MAISON_META[child.maisonId];
  const ranked = Object.values(data.maisons).sort((a, b) => b.points - a.points);
  const rank = ranked.findIndex((m) => m.id === child.maisonId) + 1;
  const evolWeek = child.historique.filter((h) => h.date > Date.now() - 7 * 86400000).reduce((s, h) => s + h.delta, 0);
  const evt = activeEvent(data.events);

  const tabs = [
    { id: "accueil", label: "Accueil", icon: "🏠" }, { id: "profil", label: "Mon profil", icon: "" },
    { id: "maison", label: "Ma Maison", icon: "🐉" }, { id: "historique", label: "Historique", icon: "📜" },
    { id: "boutique", label: "Boutique", icon: "🛍️" }, { id: "badges", label: "Badges", icon: "🏅" },
    { id: "aide", label: "Aide", icon: "❓" }, { id: "parametres", label: "Paramètres", icon: "⚙️" },
  ];

  return (
    <Shell title={`${child.prenom} ${child.nom}`} subtitle={`Groupe ${group?.name} · ${maison.name} · Saison ${data.season.number}`} tabs={tabs} active={tab} onTab={setTab} onLogout={onLogout} banner={<EventBanner event={evt} />}>
      {tab === "accueil" && <AccueilFamille child={child} rank={rank} evolWeek={evolWeek} maison={maison} actualites={data.actualites} />}
      {tab === "profil" && <MonProfilFamille child={child} group={group} maison={maison} />}
      {tab === "maison" && <MaMaisonFamille child={child} maisons={data.maisons} seasonsArchive={data.seasonsArchive} />}
      {tab === "historique" && <HistoriqueFamille child={child} />}
      {tab === "boutique" && <BoutiqueFamille data={data} child={child} persist={persist} />}
      {tab === "badges" && <BadgesFamille child={child} />}
      {tab === "aide" && <AideFamille />}
      {tab === "parametres" && <ParametresFamille child={child} data={data} persist={persist} />}
    </Shell>
  );
}

/* ============================================================
   ESPACE ÉDUCATEUR
============================================================ */
function applyDeltas(data, entries, tag) {
  const next = JSON.parse(JSON.stringify(data));
  entries.forEach(({ childId, delta, missions }) => {
    const child = next.children.find((c) => c.id === childId);
    if (!child || delta === 0) return;
    const before = child.tridents;
    child.tridents = Math.max(0, child.tridents + delta);
    const applied = child.tridents - before;
    next.maisons[child.maisonId].points += applied * 10;
    child.historique.unshift({ date: Date.now(), delta: applied, label: missions.join(", ") + (tag ? ` (${tag})` : "") });
  });
  return next;
}

function computeSeanceEntries(childIds, sel, present, multiplier) {
  return childIds.map((id) => {
    if (present[id] === false) return { childId: id, delta: 0, missions: [], present: false };
    const ids = sel[id] || new Set();
    const raw = ALL_MISSIONS.filter((m) => ids.has(m.id)).reduce((s, m) => s + m.pts, 0);
    const withEvent = raw > 0 && multiplier > 1 ? raw * multiplier : raw;
    return { childId: id, delta: clampSeance(withEvent), missions: ALL_MISSIONS.filter((m) => ids.has(m.id)).map((m) => m.label), present: true };
  });
}

function validateSeance(data, group, sel, present, editingId) {
  let next = JSON.parse(JSON.stringify(data));
  const evt = activeEvent(next.events);
  const multiplier = evt ? evt.multiplier : 1;
  const childIds = next.children.filter((c) => c.groupId === group.id).map((c) => c.id);

  if (editingId) {
    const old = next.seances.find((s) => s.id === editingId);
    if (old) {
      old.entries.forEach((e) => {
        const child = next.children.find((c) => c.id === e.childId);
        if (!child || e.appliedDelta === 0) return;
        child.tridents = Math.max(0, child.tridents - e.appliedDelta);
        next.maisons[child.maisonId].points -= e.appliedDelta * 10;
        child.historique = child.historique.filter((h) => h.seanceId !== editingId);
      });
    }
  }

  const seanceId = editingId || `seance-${Date.now()}`;
  const computed = computeSeanceEntries(childIds, sel, present, multiplier);
  const finalEntries = [];
  computed.forEach((e) => {
    const child = next.children.find((c) => c.id === e.childId);
    if (!child) return;
    if (!e.present) { finalEntries.push({ childId: e.childId, appliedDelta: 0, missions: [], present: false }); return; }
    const before = child.tridents;
    child.tridents = Math.max(0, child.tridents + e.delta);
    const applied = child.tridents - before;
    next.maisons[child.maisonId].points += applied * 10;
    if (applied !== 0) child.historique.unshift({ date: Date.now(), delta: applied, label: e.missions.join(", ") || "Séance", seanceId });
    finalEntries.push({ childId: e.childId, appliedDelta: applied, missions: e.missions, present: true });
  });

  const selectionsPlain = {};
  Object.keys(sel).forEach((cid) => { selectionsPlain[cid] = Array.from(sel[cid] || []); });

  if (editingId) {
    const rec = next.seances.find((s) => s.id === editingId);
    rec.entries = finalEntries; rec.selections = selectionsPlain; rec.present = present; rec.validatedAt = Date.now(); rec.multiplier = multiplier;
  } else {
    next.seances.unshift({ id: seanceId, groupId: group.id, date: Date.now(), validatedAt: Date.now(), selections: selectionsPlain, present, entries: finalEntries, multiplier });
  }
  return next;
}

function SeanceScreen({ group, children, onValidate, onCancel, editingRecord }) {
  const [sel, setSel] = useState(() => {
    const init = {};
    if (editingRecord) Object.entries(editingRecord.selections).forEach(([cid, ids]) => { init[cid] = new Set(ids); });
    return init;
  });
  const [present, setPresent] = useState(() => editingRecord ? { ...editingRecord.present } : Object.fromEntries(children.map((c) => [c.id, true])));

  const toggle = (childId, missionId) => setSel((prev) => { const cur = new Set(prev[childId] || []); cur.has(missionId) ? cur.delete(missionId) : cur.add(missionId); return { ...prev, [childId]: cur }; });
  const togglePresent = (childId) => setPresent((prev) => ({ ...prev, [childId]: !prev[childId] }));

  const totalFor = (childId) => {
    if (present[childId] === false) return 0;
    const ids = sel[childId] || new Set();
    return clampSeance(ALL_MISSIONS.filter((m) => ids.has(m.id)).reduce((s, m) => s + m.pts, 0));
  };
  const missionLabels = (childId) => ALL_MISSIONS.filter((m) => (sel[childId] || new Set()).has(m.id)).map((m) => m.label);

  const handleValidate = () => {
    const entries = children.map((c) => ({ childId: c.id, delta: totalFor(c.id), missions: missionLabels(c.id), present: present[c.id] !== false }));
    onValidate(sel, present, entries);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 18, color: COLORS.text, fontWeight: 700 }}>{editingRecord ? "Modifier — " : ""}Groupe {group.name}</div>
          <div style={{ color: COLORS.textDim, fontSize: 12.5 }}>{group.horaire} · {children.length} nageurs</div>
        </div>
        <Btn variant="ghost" onClick={onCancel}>← Retour</Btn>
      </div>

      <Card style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <th style={{ textAlign: "left", padding: 10, color: COLORS.textDim, position: "sticky", left: 0, background: COLORS.panel }}>Nageur</th>
              <th style={{ padding: 6, color: COLORS.textDim, minWidth: 60 }}>Présent</th>
              {POS.map((m) => <th key={m.id} style={{ padding: 6, color: COLORS.green, fontWeight: 600, minWidth: 74 }}>{m.label}<br /><span style={{ opacity: 0.7 }}>+{m.pts}</span></th>)}
              {NEG.map((m) => <th key={m.id} style={{ padding: 6, color: COLORS.red, fontWeight: 600, minWidth: 74 }}>{m.label}<br /><span style={{ opacity: 0.7 }}>{m.pts}</span></th>)}
              <th style={{ padding: 10, color: COLORS.text }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => {
              const t = totalFor(c.id);
              const isPresent = present[c.id] !== false;
              return (
                <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}`, opacity: isPresent ? 1 : 0.45 }}>
                  <td style={{ padding: 10, color: COLORS.text, fontWeight: 600, position: "sticky", left: 0, background: COLORS.panel, whiteSpace: "nowrap" }}>{c.prenom} {c.nom[0]}.</td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={isPresent} onChange={() => togglePresent(c.id)} style={{ width: 16, height: 16, accentColor: COLORS.gold, cursor: "pointer" }} />
                  </td>
                  {ALL_MISSIONS.map((m) => (
                    <td key={m.id} style={{ textAlign: "center" }}>
                      <input type="checkbox" disabled={!isPresent} checked={(sel[c.id] || new Set()).has(m.id)} onChange={() => toggle(c.id, m.id)}
                        style={{ width: 16, height: 16, accentColor: m.pts > 0 ? COLORS.green : COLORS.red, cursor: isPresent ? "pointer" : "not-allowed" }} />
                    </td>
                  ))}
                  <td style={{ textAlign: "center", fontWeight: 800, color: !isPresent ? COLORS.textDim : t > 0 ? COLORS.green : t < 0 ? COLORS.red : COLORS.textDim }}>{!isPresent ? "Absent" : (t > 0 ? "+" : "") + t}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={handleValidate}>✓ {editingRecord ? "Enregistrer les modifications" : "Valider la séance"}</Btn>
      </div>
    </div>
  );
}

function SeancesRecentes({ data, onEdit, onStats }) {
  const recent = data.seances.slice(0, 6);
  if (recent.length === 0) return null;
  return (
    <Card>
      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Séances récentes</div>
      <div style={{ display: "grid", gap: 8 }}>
        {recent.map((s) => {
          const group = data.groups.find((g) => g.id === s.groupId);
          const left = hoursLeft(s.validatedAt);
          const editable = left > 0;
          return (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: COLORS.panelLight, borderRadius: 10, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{group?.name} — {MAISON_META[group?.maisonId]?.short}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDateTime(s.validatedAt)} · {editable ? `Modifiable encore ${left}h` : "Verrouillée (48h dépassées)"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn variant="ghost" onClick={() => onStats(group)}>Statistiques</Btn>
                <Btn variant={editable ? "primary" : "ghost"} disabled={!editable} onClick={() => onEdit(s, group)}>Modifier</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatsGroup({ group, data, onBack }) {
  const seances = data.seances.filter((s) => s.groupId === group.id);
  const childIds = data.children.filter((c) => c.groupId === group.id).map((c) => c.id);
  const nbSeances = seances.length;

  const presenceByChild = childIds.map((cid) => {
    const child = data.children.find((c) => c.id === cid);
    const seen = seances.filter((s) => s.entries.some((e) => e.childId === cid && e.present));
    return { child, pct: nbSeances ? Math.round((seen.length / nbSeances) * 100) : 0 };
  });

  const avgPerSeance = nbSeances ? (seances.reduce((s, sc) => s + sc.entries.reduce((ss, e) => ss + (e.appliedDelta > 0 ? e.appliedDelta : 0), 0), 0) / nbSeances).toFixed(1) : "—";

  const missionCounts = {};
  ALL_MISSIONS.forEach((m) => (missionCounts[m.id] = 0));
  let totalAttribs = 0;
  seances.forEach((s) => s.entries.forEach((e) => { e.missions.forEach((label) => { const m = ALL_MISSIONS.find((mm) => mm.label === label); if (m) { missionCounts[m.id]++; totalAttribs++; } }); }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 18, color: COLORS.text, fontWeight: 700 }}>Statistiques — {group.name}</div>
        <Btn variant="ghost" onClick={onBack}>← Retour</Btn>
      </div>
      <Card style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div><div style={{ color: COLORS.gold, fontSize: 22, fontWeight: 800 }}>{nbSeances}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Séances validées</div></div>
        <div><div style={{ color: COLORS.gold, fontSize: 22, fontWeight: 800 }}>{avgPerSeance}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Tridents gagnés / séance (moy.)</div></div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Taux de présence</div>
        {nbSeances === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Pas encore de séance validée pour ce groupe.</div>}
        {presenceByChild.map(({ child, pct }) => (
          <div key={child.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: COLORS.text }}>{child.prenom} {child.nom[0]}.</span><span style={{ color: COLORS.textDim }}>{pct}%</span>
            </div>
            <WaveBar pct={pct} color={COLORS.gold} />
          </div>
        ))}
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Répartition des missions attribuées</div>
        {totalAttribs === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucune attribution enregistrée pour l'instant.</div>}
        {ALL_MISSIONS.map((m) => {
          const pct = totalAttribs ? Math.round((missionCounts[m.id] / totalAttribs) * 100) : 0;
          if (missionCounts[m.id] === 0) return null;
          return (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: m.pts > 0 ? COLORS.green : COLORS.red }}>{m.label}</span><span style={{ color: COLORS.textDim }}>{pct}%</span>
              </div>
              <WaveBar pct={pct} color={m.pts > 0 ? COLORS.green : COLORS.red} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function MesGroupes({ data, onOpenGroup, onEdit, onStats }) {
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <SeancesRecentes data={data} onEdit={onEdit} onStats={onStats} />
      {Object.keys(MAISON_META).map((mid) => {
        const groups = data.groups.filter((g) => g.maisonId === mid);
        return (
          <div key={mid}>
            <div style={{ color: MAISON_META[mid].color, fontWeight: 700, marginBottom: 8, fontFamily: "'Baloo 2', sans-serif", fontSize: 14 }}>{MAISON_META[mid].name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
              {groups.map((g) => {
                const n = data.children.filter((c) => c.groupId === g.id).length;
                return (
                  <button key={g.id} onClick={() => onOpenGroup(g)} style={{ textAlign: "left", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12, cursor: "pointer" }}>
                    <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 13.5 }}>{g.name}</div>
                    <div style={{ color: COLORS.textDim, fontSize: 11.5, marginTop: 2 }}>{g.horaire}</div>
                    <div style={{ color: COLORS.textDim, fontSize: 11.5 }}>{n} nageurs</div>
                    <div style={{ marginTop: 8, color: COLORS.gold, fontSize: 12, fontWeight: 700 }}>Commencer →</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccueilEduc({ data, onOpenGroup, me }) {
  const upcoming = data.groups.slice(0, 2);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 20, color: COLORS.text, fontWeight: 700 }}>Bienvenue {me?.prenom || ""} 👋</div>
      <div style={{ color: COLORS.textDim, fontSize: 13 }}>Séances d'aujourd'hui</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
        {upcoming.map((g) => {
          const n = data.children.filter((c) => c.groupId === g.id).length;
          return (
            <Card key={g.id}>
              <div style={{ color: COLORS.textDim, fontSize: 11.5 }}>{g.horaire}</div>
              <div style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'Baloo 2', sans-serif", fontSize: 15, margin: "4px 0" }}>{MAISON_META[g.maisonId].name}</div>
              <div style={{ color: COLORS.textDim, fontSize: 12 }}>{n} nageurs</div>
              <Btn style={{ marginTop: 10, width: "100%" }} onClick={() => onOpenGroup(g)}>Commencer</Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ChildProfileAdmin({ child, group, maison, onToggleBadge, onBack }) {
  const obtainedIds = obtainedBadgeIds(child);
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 520 }}>
      <Btn variant="ghost" onClick={onBack}>← Retour au répertoire</Btn>
      <Card style={{ textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: maison.color, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, color: COLORS.bgDeep }}>{child.prenom[0]}{child.nom[0]}</div>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 18, color: COLORS.text, fontWeight: 700 }}>{child.prenom} {child.nom}</div>
        <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>{child.age} ans · Groupe {group?.name} · {maison.name}</div>
      </Card>
      <Card style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
        <div><div style={{ color: COLORS.gold, fontSize: 20, fontWeight: 800 }}>{child.tridents}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Tridents</div></div>
        <div><div style={{ color: COLORS.text, fontSize: 20, fontWeight: 800 }}>{obtainedIds.size}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>Badges</div></div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Attribution manuelle des badges</div>
        <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 10 }}>Cliquez pour attribuer ou retirer un badge à cet enfant.</div>
        <div style={{ display: "grid", gap: 6 }}>
          {BADGES.map((b) => {
            const has = obtainedIds.has(b.id);
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: has ? `${COLORS.gold}18` : COLORS.panelLight, border: has ? `1px solid ${COLORS.goldDim}` : "none" }}>
                <div style={{ fontSize: 18 }}>{b.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: has ? COLORS.gold : COLORS.text, fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ color: COLORS.textDim, fontSize: 11 }}>{b.desc}</div>
                </div>
                <Btn variant={has ? "danger" : "primary"} onClick={() => onToggleBadge(b.id, has)}>{has ? "Retirer" : "Attribuer"}</Btn>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8, fontFamily: "'Baloo 2', sans-serif" }}>Derniers événements</div>
        {child.historique.slice(0, 5).map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
            <span style={{ color: COLORS.textDim }}>{h.label}</span>
            <span style={{ color: h.delta >= 0 ? COLORS.green : COLORS.red, fontWeight: 700 }}>{h.delta > 0 ? "+" : ""}{h.delta}</span>
          </div>
        ))}
        {child.historique.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucun événement pour le moment.</div>}
      </Card>
    </div>
  );
}

function AjouterEnfant({ data, persist, onDone }) {
  const [prenom, setPrenom] = useState(""); const [nom, setNom] = useState(""); const [age, setAge] = useState(8);
  const [groupId, setGroupId] = useState(data.groups[0]?.id || "");
  const [parentEmail, setParentEmail] = useState(""); const [parentPassword, setParentPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const group = data.groups.find((g) => g.id === groupId);

  const messageFor = (code) => ({
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail. Pour un 2ᵉ enfant sur le même compte, ajoutez son identifiant à la liste childIds de ce compte directement dans Firestore (console.firebase.google.com), ou utilisez un autre e-mail pour l'instant.",
    "auth/invalid-email": "Adresse e-mail du parent invalide.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
  }[code] || "Impossible de créer le compte du parent.");

  const creer = async () => {
    if (!prenom.trim() || !nom.trim() || !group || !parentEmail.trim() || parentPassword.length < 6) return;
    setErr(""); setBusy(true);
    const childId = `${prenom}-${nom}-${Date.now()}`.toLowerCase();
    try {
      const uid = await createManagedAccount(parentEmail.trim(), parentPassword);
      await setDoc(doc(db, "users", uid), { role: "famille", childIds: [childId] });
      const next = JSON.parse(JSON.stringify(data));
      next.children.push({
        id: childId,
        prenom: prenom.trim(), nom: nom.trim(), age: Number(age), groupId: group.id, maisonId: group.maisonId,
        tridents: 0, badgesObtained: [], historique: [],
        settings: { notifications: true, email: parentEmail.trim() },
      });
      await persist(next);
      onDone();
    } catch (e) {
      setErr(messageFor(e.code));
    } finally { setBusy(false); }
  };

  return (
    <Card style={{ maxWidth: 420 }}>
      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Ajouter un enfant</div>
      <div style={{ display: "grid", gap: 8 }}>
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
        <input type="number" min={3} max={18} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Âge" style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }}>
          {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name} — {MAISON_META[g.maisonId].name}</option>)}
        </select>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 8, color: COLORS.textDim, fontSize: 11.5 }}>Compte de connexion du parent</div>
        <input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} type="email" placeholder="E-mail du parent" style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
        <input value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} type="text" placeholder="Mot de passe provisoire (6 caractères min.)" style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
      </div>
      {err && <div style={{ color: BRAND.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Btn onClick={creer} disabled={busy || !prenom.trim() || !nom.trim() || !parentEmail.trim() || parentPassword.length < 6}>{busy ? "Création…" : "Créer l'enfant"}</Btn>
        <Btn variant="ghost" onClick={onDone}>Annuler</Btn>
      </div>
    </Card>
  );
}

function Repertoire({ data, persist, onValidate }) {
  const [q, setQ] = useState("");
  const [selectedChild, setSelectedChild] = useState(null);
  const [profileChild, setProfileChild] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sel, setSel] = useState(new Set());
  const filtered = data.children.filter((c) => `${c.prenom} ${c.nom} ${data.groups.find((g) => g.id === c.groupId)?.name}`.toLowerCase().includes(q.toLowerCase()));

  const toggleBadge = (childId, badgeId, has) => {
    const next = JSON.parse(JSON.stringify(data));
    const child = next.children.find((c) => c.id === childId);
    child.badgesObtained = child.badgesObtained || [];
    child.badgesObtained = has ? child.badgesObtained.filter((id) => id !== badgeId) : [...child.badgesObtained, badgeId];
    persist(next);
  };

  if (profileChild) {
    const c = data.children.find((x) => x.id === profileChild);
    return <ChildProfileAdmin child={c} group={data.groups.find((g) => g.id === c.groupId)} maison={MAISON_META[c.maisonId]}
      onToggleBadge={(badgeId, has) => toggleBadge(c.id, badgeId, has)} onBack={() => setProfileChild(null)} />;
  }

  if (selectedChild) {
    const c = data.children.find((x) => x.id === selectedChild);
    const total = clampSeance(ALL_MISSIONS.filter((m) => sel.has(m.id)).reduce((s, m) => s + m.pts, 0));
    return (
      <div style={{ display: "grid", gap: 14, maxWidth: 480 }}>
        <Btn variant="ghost" onClick={() => { setSelectedChild(null); setSel(new Set()); }}>← Retour au répertoire</Btn>
        <Card>
          <div style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'Baloo 2', sans-serif", fontSize: 16 }}>{c.prenom} {c.nom}</div>
          <div style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 12 }}>Attribution hors-groupe (stage, événement, remplacement)</div>
          <div style={{ display: "grid", gap: 6 }}>
            {ALL_MISSIONS.map((m) => (
              <label key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: COLORS.panelLight, cursor: "pointer" }}>
                <span style={{ color: COLORS.text, fontSize: 13 }}>{m.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: m.pts > 0 ? COLORS.green : COLORS.red, fontWeight: 700, fontSize: 12.5 }}>{m.pts > 0 ? "+" : ""}{m.pts}</span>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => setSel((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} style={{ width: 16, height: 16, accentColor: m.pts > 0 ? COLORS.green : COLORS.red }} />
                </span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: COLORS.textDim, fontSize: 13 }}>Total : <b style={{ color: total >= 0 ? COLORS.green : COLORS.red }}>{total > 0 ? "+" : ""}{total}</b></span>
            <Btn onClick={() => { onValidate([{ childId: c.id, delta: total, missions: ALL_MISSIONS.filter((m) => sel.has(m.id)).map((m) => m.label) }]); setSelectedChild(null); setSel(new Set()); }} disabled={total === 0}>Valider</Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {showAdd && <AjouterEnfant data={data} persist={persist} onDone={() => setShowAdd(false)} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Rechercher par nom, prénom, groupe…" style={{ flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panel, color: COLORS.text, fontSize: 13, outline: "none" }} />
        <Btn onClick={() => setShowAdd((v) => !v)}>+ Ajouter un enfant</Btn>
      </div>
      <Card style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>{["Nom", "Prénom", "Groupe", "Maison", "Tridents", ""].map((h) => <th key={h} style={{ textAlign: "left", padding: 10, color: COLORS.textDim, fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: 10, color: COLORS.text }}>{c.nom}</td>
                <td style={{ padding: 10, color: COLORS.text }}>{c.prenom}</td>
                <td style={{ padding: 10, color: COLORS.textDim }}>{data.groups.find((g) => g.id === c.groupId)?.name}</td>
                <td style={{ padding: 10 }}><Chip color={MAISON_META[c.maisonId].color}>{MAISON_META[c.maisonId].short}</Chip></td>
                <td style={{ padding: 10, color: COLORS.gold, fontWeight: 700 }}>{c.tridents}</td>
                <td style={{ padding: 10, display: "flex", gap: 6 }}>
                  <Btn variant="ghost" onClick={() => setProfileChild(c.id)}>Profil</Btn>
                  <Btn variant="ghost" onClick={() => setSelectedChild(c.id)}>Attribuer</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ClassementEduc({ data }) {
  const ranked = Object.values(data.maisons).sort((a, b) => b.points - a.points);
  const max = ranked[0]?.points || 1;
  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif", fontSize: 16 }}>Classement des Maisons</div>
      <PodiumChart ranked={ranked} max={max} />
      <div style={{ marginTop: 14 }}>
      {ranked.map((m, i) => (
        <div key={m.id} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: COLORS.text, fontWeight: 700 }}>{["🥇", "🥈", "🥉", "4️⃣"][i]} {MAISON_META[m.id].name}</span><span style={{ color: COLORS.textDim }}>{m.points} pts</span>
          </div>
          <WaveBar pct={(m.points / max) * 100} color={MAISON_META[m.id].color} />
        </div>
      ))}
      </div>
    </Card>
  );
}

function BoutiqueAdmin({ data, persist }) {
  const toggleOpen = () => persist({ ...data, boutiqueOuverte: !data.boutiqueOuverte });
  const setImage = (productId, url) => {
    const next = JSON.parse(JSON.stringify(data));
    next.products.find((p) => p.id === productId).image = url;
    persist(next);
  };
  const setPrice = (productId, price) => {
    const val = Math.max(0, Number(price) || 0);
    const next = JSON.parse(JSON.stringify(data));
    next.products.find((p) => p.id === productId).price = val;
    persist(next);
  };
  const setStock = (productId, stock) => {
    const val = Math.max(0, Math.round(Number(stock) || 0));
    const next = JSON.parse(JSON.stringify(data));
    next.products.find((p) => p.id === productId).stock = val;
    persist(next);
  };
  const validateOrder = (orderId) => {
    const next = JSON.parse(JSON.stringify(data));
    const order = next.orders.find((o) => o.id === orderId);
    if (!order || order.status !== "attente") return;
    const child = next.children.find((c) => c.id === order.childId);
    const product = next.products.find((p) => p.id === order.productId);
    if (child.tridents < order.price || (product && product.stock <= 0)) return;
    child.tridents -= order.price;
    if (product) product.stock -= 1;
    child.historique.unshift({ date: Date.now(), delta: -order.price, label: `Achat boutique : ${order.productName}` });
    order.status = "validée";
    persist(next);
  };
  const pending = data.orders.filter((o) => o.status === "attente");
  const done = data.orders.filter((o) => o.status === "validée");
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div><div style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'Baloo 2', sans-serif" }}>État de la boutique</div><div style={{ color: COLORS.textDim, fontSize: 12 }}>{data.boutiqueOuverte ? "Ouverte aux commandes" : "Fermée"}</div></div>
        <Btn variant={data.boutiqueOuverte ? "danger" : "primary"} onClick={toggleOpen}>{data.boutiqueOuverte ? "Fermer la boutique" : "Ouvrir la boutique"}</Btn>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Commandes en attente ({pending.length})</div>
        {pending.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucune commande en attente.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {pending.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: COLORS.panelLight, borderRadius: 10, flexWrap: "wrap", gap: 8 }}>
              <div><div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{o.childName} — {o.productName}</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDateTime(o.date)} · {o.price} Tridents</div></div>
              <Btn onClick={() => validateOrder(o.id)}>Valider</Btn>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Commandes validées — à retirer ({done.length})</div>
        {done.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucune commande validée pour le moment.</div>}
        {done.map((o) => (<div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}><span style={{ color: COLORS.text }}>{o.childName} — {o.productName}</span><span style={{ color: COLORS.textDim }}>{fmtDate(o.date)}</span></div>))}
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Produits : prix &amp; photos</div>
        <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 10 }}>Modifiez le prix en Tridents et, si besoin, le lien d'une image pour chaque produit.</div>
        <div style={{ display: "grid", gap: 10 }}>
          {data.products.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {p.image ? <img src={p.image} alt={p.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div style={{ fontSize: 20, width: 36, textAlign: "center" }}>{p.emoji}</div>}
              <span style={{ color: COLORS.text, fontSize: 12.5, width: 110, flexShrink: 0 }}>{p.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" min={0} defaultValue={p.price} onBlur={(e) => setPrice(p.id, e.target.value)}
                  style={{ width: 70, padding: "6px 8px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.gold, fontWeight: 700, fontSize: 12.5, outline: "none" }} />
                <TridentIcon size={12} />
              </div>
              <input defaultValue={p.image} onBlur={(e) => setImage(p.id, e.target.value)} placeholder="https://…"
                style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12, outline: "none" }} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Stocks</div>
        <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 10 }}>Modifiez la quantité disponible pour chaque produit.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8 }}>
          {data.products.map((p) => (<div key={p.id} style={{ background: COLORS.panelLight, borderRadius: 10, padding: 8, textAlign: "center" }}>{p.image ? <img src={p.image} alt={p.name} style={{ width: "100%", height: 36, objectFit: "cover", borderRadius: 6 }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div style={{ fontSize: 20 }}>{p.emoji}</div>}<div style={{ color: COLORS.text, fontSize: 11.5, fontWeight: 600, marginTop: 4 }}>{p.name}</div>
            <input type="number" min={0} defaultValue={p.stock} onBlur={(e) => setStock(p.id, e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "5px 6px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.panel, color: p.stock > 5 ? COLORS.text : COLORS.red, fontSize: 12, textAlign: "center", outline: "none" }} />
          </div>))}
        </div>
      </Card>
    </div>
  );
}

function PublierActu({ data, persist }) {
  const [titre, setTitre] = useState(""); const [texte, setTexte] = useState("");
  const publier = () => {
    if (!titre.trim() || !texte.trim()) return;
    const next = JSON.parse(JSON.stringify(data));
    next.actualites.unshift({ id: `a-${Date.now()}`, title: titre.trim(), text: texte.trim(), date: Date.now() });
    persist(next); setTitre(""); setTexte("");
  };
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Publier une actualité</div>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, marginBottom: 8, outline: "none" }} />
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écrire le texte de l'actualité…" rows={4} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, resize: "vertical", outline: "none" }} />
        <Btn style={{ marginTop: 10 }} onClick={publier} disabled={!titre.trim() || !texte.trim()}>Publier</Btn>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Actualités publiées</div>
        {data.actualites.map((a, i) => (<div key={a.id} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${COLORS.border}` : "none" }}><div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{a.title}</div><div style={{ color: COLORS.textDim, fontSize: 12 }}>{a.text}</div><div style={{ color: COLORS.textDim, fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>{fmtDate(a.date)}</div></div>))}
      </Card>
    </div>
  );
}

function Evenements({ data, persist }) {
  const [nom, setNom] = useState("Double Tridents");
  const [jours, setJours] = useState(7);
  const [mult, setMult] = useState(2);
  const evt = activeEvent(data.events);

  const creer = () => {
    if (!nom.trim()) return;
    const next = JSON.parse(JSON.stringify(data));
    next.events.unshift({ id: `evt-${Date.now()}`, name: nom.trim(), start: Date.now(), end: Date.now() + jours * 86400000, multiplier: Number(mult) });
    persist(next);
  };
  const supprimer = (id) => { const next = { ...data, events: data.events.filter((e) => e.id !== id) }; persist(next); };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      {evt && <Card style={{ borderColor: COLORS.gold }}><div style={{ color: COLORS.gold, fontWeight: 700, fontSize: 13 }}>⚡ Événement actif : {evt.name} (x{evt.multiplier}) jusqu'au {fmtDate(evt.end)}</div></Card>}
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Créer un événement spécial</div>
        <div style={{ display: "grid", gap: 8 }}>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de l'événement" style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, fontSize: 12, color: COLORS.textDim }}>Durée (jours)
              <input type="number" min={1} value={jours} onChange={(e) => setJours(Number(e.target.value))} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
            </label>
            <label style={{ flex: 1, fontSize: 12, color: COLORS.textDim }}>Multiplicateur
              <input type="number" min={2} max={5} value={mult} onChange={(e) => setMult(Number(e.target.value))} style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
            </label>
          </div>
        </div>
        <Btn style={{ marginTop: 10 }} onClick={creer} disabled={!nom.trim()}>Lancer l'événement</Btn>
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Historique des événements</div>
        {data.events.length === 0 && <div style={{ color: COLORS.textDim, fontSize: 13 }}>Aucun événement créé.</div>}
        {data.events.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${COLORS.border}`, fontSize: 12.5 }}>
            <div><div style={{ color: COLORS.text, fontWeight: 600 }}>{e.name} (x{e.multiplier})</div><div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDate(e.start)} → {fmtDate(e.end)}</div></div>
            <Btn variant="ghost" onClick={() => supprimer(e.id)}>Supprimer</Btn>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Saison({ data, persist }) {
  const cloturer = () => {
    const ranked = Object.values(data.maisons).sort((a, b) => b.points - a.points);
    const winnerId = ranked[0]?.id;
    const next = JSON.parse(JSON.stringify(data));
    next.seasonsArchive.unshift({ number: data.season.number, startDate: data.season.startDate, endDate: Date.now(), winnerId, classement: ranked.map((m) => ({ id: m.id, points: m.points })) });
    next.children.forEach((c) => { c.tridents = 0; c.historique = []; });
    Object.keys(next.maisons).forEach((id) => (next.maisons[id].points = 0));
    next.seances = [];
    next.season = { number: data.season.number + 1, startDate: Date.now() };
    persist(next);
  };
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6, fontFamily: "'Baloo 2', sans-serif" }}>Saison en cours</div>
        <div style={{ color: COLORS.gold, fontSize: 20, fontWeight: 800 }}>Saison {data.season.number}</div>
        <div style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>Débutée le {fmtDate(data.season.startDate)}</div>
      </Card>
      <Card style={{ borderColor: COLORS.red }}>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6, fontFamily: "'Baloo 2', sans-serif" }}>Clôturer la saison</div>
        <div style={{ color: COLORS.textDim, fontSize: 12.5, marginBottom: 10 }}>Les Tridents de tous les enfants repassent à 0, les points de Maison sont réinitialisés, et le classement final est archivé et reste consultable.</div>
        <Btn variant="danger" onClick={cloturer}>Clôturer la saison {data.season.number}</Btn>
      </Card>
      {data.seasonsArchive.length > 0 && (
        <Card>
          <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 10, fontFamily: "'Baloo 2', sans-serif" }}>Saisons archivées</div>
          {data.seasonsArchive.map((s) => (
            <div key={s.number} style={{ padding: "8px 0", borderTop: `1px solid ${COLORS.border}`, fontSize: 12.5 }}>
              <div style={{ color: COLORS.text, fontWeight: 600 }}>Saison {s.number} — vainqueur : {MAISON_META[s.winnerId]?.name}</div>
              <div style={{ color: COLORS.textDim, fontSize: 11 }}>{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ color: COLORS.text, fontSize: 13 }}>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 44, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "none", cursor: "pointer", padding: 0 }} />
    </div>
  );
}

function Personnalisation({ data, persist }) {
  const setTheme = (key, val) => { const next = JSON.parse(JSON.stringify(data)); next.theme[key] = val; persist(next); };
  const setMaison = (id, val) => { const next = JSON.parse(JSON.stringify(data)); next.maisonColors[id] = val; persist(next); };
  const reset = () => { const next = JSON.parse(JSON.stringify(data)); next.theme = { ...DEFAULT_THEME, brandRed: "#B3271F", loginBg: "#FFFFFF" }; next.maisonColors = { ...DEFAULT_MAISON_COLORS }; next.logoImageLight = ""; next.logoImageDark = ""; persist(next); };

  const uploadLogo = (key, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const next = JSON.parse(JSON.stringify(data)); next[key] = reader.result; persist(next); };
    reader.readAsDataURL(file);
  };
  const removeLogo = (key) => { const next = { ...data, [key]: "" }; persist(next); };

  const LogoSlot = ({ label, keyName, bg }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <div style={{ width: 50, height: 50, borderRadius: 10, background: bg, border: "1px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {data[keyName] ? <img src={data[keyName]} alt="Logo" style={{ width: "80%", height: "80%", objectFit: "contain" }} /> : <img src={keyName === "logoImageLight" ? LOGO_LIGHT_DEFAULT : LOGO_DARK_DEFAULT} alt="Logo" style={{ width: "80%", height: "80%", objectFit: "contain" }} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ color: COLORS.text, fontSize: 12 }}>{label}</div>
        <label style={{ fontSize: 11.5, color: COLORS.gold, cursor: "pointer", textDecoration: "underline" }}>
          Remplacer
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadLogo(keyName, e.target.files[0])} />
        </label>
        {data[keyName] && <button onClick={() => removeLogo(keyName)} style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 11, cursor: "pointer", textAlign: "left", padding: 0 }}>Revenir au logo par défaut</button>}
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Page de connexion</div>
        <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 10 }}>Le logo (fond clair et fond sombre), la couleur d'accent et le fond de l'écran d'accueil.</div>
        <LogoSlot label="Logo sur fond clair" keyName="logoImageLight" bg="#fff" />
        <LogoSlot label="Logo sur fond sombre" keyName="logoImageDark" bg="#111" />
        <ColorField label="Couleur d'accent (rouge)" value={data.theme.brandRed || "#B3271F"} onChange={(v) => setTheme("brandRed", v)} />
        <ColorField label="Couleur de fond de l'écran d'accueil" value={data.theme.loginBg || "#FFFFFF"} onChange={(v) => setTheme("loginBg", v)} />
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Couleurs générales</div>
        <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 8 }}>Les changements s'appliquent immédiatement à toute l'application.</div>
        <ColorField label="Couleur d'accent (Tridents, boutons)" value={data.theme.gold} onChange={(v) => setTheme("gold", v)} />
        <ColorField label="Fond principal" value={data.theme.bg} onChange={(v) => setTheme("bg", v)} />
        <ColorField label="Fond profond (barre latérale)" value={data.theme.bgDeep} onChange={(v) => setTheme("bgDeep", v)} />
        <ColorField label="Fond des cartes" value={data.theme.panel} onChange={(v) => setTheme("panel", v)} />
        <ColorField label="Texte principal" value={data.theme.text} onChange={(v) => setTheme("text", v)} />
        <ColorField label="Vert (gains)" value={data.theme.green} onChange={(v) => setTheme("green", v)} />
        <ColorField label="Rouge (pertes)" value={data.theme.red} onChange={(v) => setTheme("red", v)} />
      </Card>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8, fontFamily: "'Baloo 2', sans-serif" }}>Couleurs des Maisons</div>
        {Object.keys(MAISON_META).map((id) => (
          <ColorField key={id} label={MAISON_META[id].name} value={data.maisonColors[id]} onChange={(v) => setMaison(id, v)} />
        ))}
      </Card>
      <Btn variant="ghost" onClick={reset}>Réinitialiser les couleurs par défaut</Btn>
    </div>
  );
}

function GestionAcces({ data, persist }) {
  const [prenom, setPrenom] = useState(""); const [nom, setNom] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [role, setRole] = useState("Éducateur");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const roles = ["Éducateur", "Administrateur", "Administrateur général"];

  const messageFor = (code) => ({
    "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail.",
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
  }[code] || "Impossible de créer ce compte.");

  const ajouter = async () => {
    if (!prenom.trim() || !nom.trim() || !email.trim() || password.length < 6) return;
    setErr(""); setBusy(true);
    const staffId = `staff-${Date.now()}`;
    try {
      const uid = await createManagedAccount(email.trim(), password);
      await setDoc(doc(db, "users", uid), { role, staffId });
      const next = JSON.parse(JSON.stringify(data));
      next.staff.push({ id: staffId, prenom: prenom.trim(), nom: nom.trim(), email: email.trim(), role });
      await persist(next);
      setPrenom(""); setNom(""); setEmail(""); setPassword("");
    } catch (e) {
      setErr(messageFor(e.code));
    } finally { setBusy(false); }
  };
  const setRoleFor = async (id, newRole) => {
    const next = JSON.parse(JSON.stringify(data));
    next.staff.find((s) => s.id === id).role = newRole;
    await persist(next);
    // Met aussi à jour le vrai compte (users/{uid}), pas seulement l'affichage.
    const q = query(collection(db, "users"), where("staffId", "==", id));
    const snap = await getDocs(q);
    snap.forEach((d) => setDoc(d.ref, { ...d.data(), role: newRole }));
  };
  const supprimer = async (id) => {
    const next = { ...data, staff: data.staff.filter((s) => s.id !== id) };
    await persist(next);
    // Supprime aussi l'accès du compte lié (la personne ne pourra plus se
    // connecter — son compte Authentication reste techniquement présent
    // mais n'a plus de rôle, donc plus aucun accès à l'application).
    const q = query(collection(db, "users"), where("staffId", "==", id));
    const snap = await getDocs(q);
    snap.forEach((d) => deleteDoc(d.ref));
  };

  return (
    <Card>
      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 4, fontFamily: "'Baloo 2', sans-serif" }}>Gestion des accès</div>
      <div style={{ color: COLORS.textDim, fontSize: 11.5, marginBottom: 12 }}>Réservée à l'administrateur général : donner, modifier ou supprimer les accès des éducateurs et administrateurs.</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
        {data.staff.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", background: COLORS.panelLight, borderRadius: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{s.prenom} {s.nom}</div>
              <div style={{ color: COLORS.textDim, fontSize: 11 }}>{s.email}</div>
            </div>
            <select value={s.role} onChange={(e) => setRoleFor(s.id, e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panel, color: COLORS.text, fontSize: 12 }}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Btn variant="danger" onClick={() => supprimer(s.id)}>Supprimer</Btn>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ color: COLORS.text, fontSize: 12.5, fontWeight: 600 }}>Ajouter un membre</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" style={{ flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12.5, outline: "none" }} />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12.5, outline: "none" }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" style={{ flex: 1, minWidth: 140, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12.5, outline: "none" }} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="Mot de passe provisoire" style={{ flex: 1, minWidth: 140, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12.5, outline: "none" }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 12.5 }}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {err && <div style={{ color: BRAND.red, fontSize: 12 }}>{err}</div>}
        <Btn onClick={ajouter} disabled={busy || !prenom.trim() || !nom.trim() || !email.trim() || password.length < 6} style={{ width: "fit-content" }}>{busy ? "Création…" : "Ajouter"}</Btn>
      </div>
    </Card>
  );
}

function ParametresEduc({ data, persist, me, isAdminGeneral, role, rawProfile }) {
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const changerMotDePasse = async () => {
    if (newPassword.length < 6) { setMsg("6 caractères minimum."); return; }
    try {
      await updatePassword(auth.currentUser, newPassword);
      setMsg("Mot de passe mis à jour.");
      setNewPassword("");
    } catch (e) {
      setMsg("Impossible (reconnectez-vous puis réessayez).");
    }
  };
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
      <Card>
        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 12, fontFamily: "'Baloo 2', sans-serif" }}>Informations personnelles</div>
        <div style={{ display: "grid", gap: 10 }}>
          {[["Prénom", me?.prenom || "—"], ["Nom", me?.nom || "—"], ["E-mail", me?.email || auth.currentUser?.email || "—"], ["Rôle", me?.role || "—"]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ color: COLORS.textDim, fontSize: 12.5 }}>{label}</span><span style={{ color: COLORS.text, fontSize: 13 }}>{val}</span></div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 8 }}>
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="text" placeholder="Nouveau mot de passe" style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelLight, color: COLORS.text, fontSize: 13, outline: "none" }} />
          <Btn variant="ghost" onClick={changerMotDePasse}>Changer</Btn>
        </div>
        {msg && <div style={{ color: COLORS.textDim, fontSize: 11.5, marginTop: 6 }}>{msg}</div>}
      </Card>
      {isAdminGeneral && <GestionAcces data={data} persist={persist} />}
    </div>
  );
}

function EducateurApp({ data, persist, role, rawProfile, me, onLogout }) {
  const [tab, setTab] = useState("accueil");
  const [openGroup, setOpenGroup] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [statsGroup, setStatsGroup] = useState(null);
  const evt = activeEvent(data.events);
  const isAdminGeneral = (role || "").toString().trim().toLowerCase().normalize("NFC") === "administrateur général".normalize("NFC");

  const tabs = [
    { id: "accueil", label: "Accueil", icon: "🏠" }, { id: "groupes", label: "Mes groupes", icon: "👥" },
    { id: "repertoire", label: "Répertoire", icon: "📇" }, { id: "classement", label: "Classement", icon: "🏆" },
    { id: "boutique", label: "Boutique", icon: "🛍️" }, { id: "evenements", label: "Événements", icon: "⚡" },
    ...(isAdminGeneral ? [
      { id: "actualite", label: "Publier actu", icon: "📣" }, { id: "saison", label: "Saison", icon: "📅" },
      { id: "personnalisation", label: "Personnalisation", icon: "🎨" },
    ] : []),
    { id: "parametres", label: "Paramètres", icon: "⚙️" },
  ];

  const resetSeanceView = () => { setOpenGroup(null); setEditingRecord(null); setStatsGroup(null); };

  const handleOpenGroup = (g) => { resetSeanceView(); setOpenGroup(g); setTab("groupes"); };
  const handleEdit = (record, group) => { resetSeanceView(); setOpenGroup(group); setEditingRecord(record); setTab("groupes"); };
  const handleStats = (group) => { resetSeanceView(); setStatsGroup(group); setTab("groupes"); };

  const handleValidateSeance = (sel, present, entriesUnused) => {
    const next = validateSeance(data, openGroup, sel, present, editingRecord?.id);
    persist(next);
    resetSeanceView();
  };
  const handleValidateRepertoire = (entries) => { persist(applyDeltas(data, entries, "événement")); };

  return (
    <Shell title="Espace éducateur" subtitle={`${me ? `${me.prenom} · ${me.role}` : role} · NEC Académie · Saison ${data.season.number}`} tabs={tabs}
      active={tab} onTab={(t) => { setTab(t); if (t !== "groupes") resetSeanceView(); }} onLogout={onLogout} banner={<EventBanner event={evt} />}>
      {tab === "accueil" && <AccueilEduc data={data} onOpenGroup={handleOpenGroup} me={me} />}
      {tab === "groupes" && !openGroup && !statsGroup && <MesGroupes data={data} onOpenGroup={setOpenGroup} onEdit={handleEdit} onStats={handleStats} />}
      {tab === "groupes" && statsGroup && <StatsGroup group={statsGroup} data={data} onBack={resetSeanceView} />}
      {tab === "groupes" && openGroup && !statsGroup && (
        <SeanceScreen group={openGroup} children={data.children.filter((c) => c.groupId === openGroup.id)}
          onValidate={handleValidateSeance} onCancel={resetSeanceView} editingRecord={editingRecord} />
      )}
      {tab === "repertoire" && <Repertoire data={data} persist={persist} onValidate={handleValidateRepertoire} />}
      {tab === "classement" && <ClassementEduc data={data} />}
      {tab === "boutique" && <BoutiqueAdmin data={data} persist={persist} />}
      {tab === "evenements" && <Evenements data={data} persist={persist} />}
      {isAdminGeneral && tab === "actualite" && <PublierActu data={data} persist={persist} />}
      {isAdminGeneral && tab === "saison" && <Saison data={data} persist={persist} />}
      {isAdminGeneral && tab === "personnalisation" && <Personnalisation data={data} persist={persist} />}
      {tab === "parametres" && <ParametresEduc data={data} persist={persist} me={me} isAdminGeneral={isAdminGeneral} role={role} rawProfile={rawProfile} />}
    </Shell>
  );
}

/* ============================================================
   ROOT
============================================================ */
export default function NecAcademieApp() {
  const { authUser, authLoading, profile, profileLoading, tokenReady } = useAuthProfile();
  const { data, loading, error, persist } = useAppData(tokenReady ? authUser : null);
  const [childId, setChildId] = useState(null);

  if (data) {
    Object.assign(COLORS, data.theme || DEFAULT_THEME);
    if (data.theme?.brandRed) { BRAND.red = data.theme.brandRed; }
    Object.keys(MAISON_META).forEach((id) => {
      MAISON_META[id].color = (data.maisonColors && data.maisonColors[id]) || MAISON_META[id].color;
    });
  }

  const fontStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
      ::-webkit-scrollbar { height: 8px; width: 8px; }
      ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 8px; }
      @media (min-width: 768px) { .hidden.md\\:flex { display: flex !important; } .md\\:hidden { display: none !important; } }
    `}</style>
  );

  // La connexion est vérifiée AVANT toute tentative de lecture des données
  // du club (les règles Firestore exigent désormais un compte connecté).
  if (authLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.textDim }}>{fontStyle}Chargement de NEC Académie…</div>;
  }

  if (!authUser) {
    // Avant connexion, l'appli n'a pas accès aux réglages de personnalisation
    // (logo, couleurs) : l'écran de connexion utilise l'habillage par défaut.
    return (
      <div style={{ background: BRAND.white }}>
        {fontStyle}
        <Login logoLight="" logoDark="" bgColor="" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.red, textAlign: "center", padding: 24 }}>
        {fontStyle}
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Impossible de se connecter à la base de données</div>
          <div style={{ color: COLORS.textDim, fontSize: 13, maxWidth: 420 }}>
            Vérifiez les règles Firestore, et que votre compte a bien un document dans la collection <code>users</code>. Détail technique : {String(error.message || error)}
          </div>
          <button onClick={() => signOut(auth)} style={{ marginTop: 14, padding: "9px 20px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textDim, cursor: "pointer" }}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.textDim }}>{fontStyle}Chargement de NEC Académie…</div>;
  }

  if (profileLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.textDim }}>{fontStyle}Chargement de votre compte…</div>;
  }

  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.red, textAlign: "center", padding: 24 }}>
        {fontStyle}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Ce compte n'a pas encore d'accès configuré</div>
          <div style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 16 }}>Contactez l'administrateur du club pour qu'il vous associe un profil.</div>
          <button onClick={() => signOut(auth)} style={{ padding: "9px 20px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textDim, cursor: "pointer" }}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  if (profile.role === "famille") {
    const myChildren = data.children.filter((c) => (profile.childIds || []).includes(c.id));
    if (myChildren.length === 0) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.textDim, textAlign: "center", padding: 24 }}>
          {fontStyle}
          <div>
            <div style={{ marginBottom: 16 }}>Aucun enfant n'est associé à ce compte pour le moment.</div>
            <button onClick={() => signOut(auth)} style={{ padding: "9px 20px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textDim, cursor: "pointer" }}>Se déconnecter</button>
          </div>
        </div>
      );
    }
    if (myChildren.length > 1 && !childId) {
      return (
        <div style={{ background: COLORS.bg }}>
          {fontStyle}
          <ChildPicker children={myChildren} onPick={setChildId} onBack={() => signOut(auth)} />
        </div>
      );
    }
    const cid = childId || myChildren[0].id;
    return (
      <div style={{ background: COLORS.bg }}>
        {fontStyle}
        <FamilleApp data={data} persist={persist} childId={cid} onLogout={() => { signOut(auth); setChildId(null); }} />
      </div>
    );
  }

  const norm = (v) => (v || "").toString().trim().toLowerCase().normalize("NFC");
  const me =
    data.staff.find((s) => norm(s.id) === norm(profile.staffId)) ||
    data.staff.find((s) => norm(s.email) === norm(authUser?.email));
  return (
    <div style={{ background: COLORS.bg }}>
      {fontStyle}
      <EducateurApp data={data} persist={persist} role={profile.role} rawProfile={profile} me={me} onLogout={() => signOut(auth)} />
    </div>
  );
}
