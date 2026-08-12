// Configuration Firebase
// Les valeurs viennent des variables d'environnement (fichier .env en local,
// et variables d'environnement Vercel en production). Ne mettez jamais vos
// clÃ©s directement dans ce fichier.
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Application secondaire : sert uniquement Ã  crÃ©er des comptes (famille,
// Ã©ducateur, admin) depuis l'espace administrateur SANS dÃ©connecter la
// personne qui est en train de crÃ©er ce compte. Astuce standard Firebase,
// entiÃ¨rement gratuite (plan Spark), pas besoin de serveur.
const secondaryApp = getApps().some((a) => a.name === "Secondary")
  ? getApps().find((a) => a.name === "Secondary")
  : initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
