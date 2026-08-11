# NEC Académie — Guide de mise en ligne (pas à pas)

Ce dossier contient une vraie petite application web (créée avec **Vite + React**)
qui reprend exactement l'interface et le fonctionnement de votre prototype,
mais qui enregistre désormais les données dans **Firebase Firestore**
(une base de données gratuite dans le cloud) au lieu de la mémoire du
navigateur. Résultat : un éducateur qui valide une séance sur son téléphone,
et un parent qui consulte l'appli sur sa tablette, voient **les mêmes données,
mises à jour en temps réel.**

Vous n'avez pas besoin de savoir coder pour suivre ce guide : tout se fait
dans des interfaces web (Firebase, GitHub, Vercel), à la souris.

---

## Vue d'ensemble

1. Créer une base de données Firebase (gratuite) → récupérer 6 petites clés
2. Mettre le projet en ligne sur GitHub (glisser-déposer les fichiers)
3. Connecter GitHub à Vercel et déployer (gratuit)
4. Ajouter les clés Firebase dans Vercel

Comptez environ 20 à 30 minutes la première fois.

---

## Étape 1 — Créer le projet Firebase

1. Allez sur **https://console.firebase.google.com** et connectez-vous avec
   un compte Google (créez-en un dédié au club si vous préférez).
2. Cliquez sur **"Ajouter un projet"**.
3. Donnez-lui un nom, par exemple `nec-academie`. Continuez.
4. Firebase vous propose d'activer Google Analytics : vous pouvez le
   **désactiver**, ce n'est pas utile ici. Cliquez sur **"Créer le projet"**.
5. Une fois le projet créé, cliquez sur **"Continuer"**.

### Activer Firestore (la base de données)

1. Dans le menu de gauche, cliquez sur **"Firestore Database"** (sous "Build" /
   "Compilation").
2. Cliquez sur **"Créer une base de données"**.
3. Choisissez un emplacement proche de vous, par exemple `eur3 (europe-west)`.
   Ce choix est définitif, mais peu important pour un petit club.
4. Choisissez **"Démarrer en mode test"** (test mode). Cela autorise la
   lecture/écriture pendant 30 jours — largement le temps de finaliser
   l'appli. Vous ajusterez les règles ensuite (voir l'encadré sécurité
   plus bas).
5. Cliquez sur **"Créer"**.

### Récupérer les clés de connexion

1. Cliquez sur la petite roue dentée ⚙️ en haut à gauche → **"Paramètres du
   projet"**.
2. Descendez jusqu'à **"Vos applications"** et cliquez sur l'icône `</>`
   (Web) pour ajouter une application web.
3. Donnez-lui un surnom, par exemple `nec-academie-web`. Ne cochez pas
   "Firebase Hosting" (nous utiliserons Vercel). Cliquez sur **"Enregistrer
   l'application"**.
4. Firebase affiche un bloc de code contenant un objet `firebaseConfig`
   avec 6 valeurs : `apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`. **Gardez cette page ouverte**, vous en
   aurez besoin à l'étape 4.

### ⚠️ À propos de la sécurité

Le prototype n'a pas de vrai système de connexion (le champ "mot de passe"
n'est pas vérifié). En mode test, Firestore est donc accessible par
quiconque connaît l'adresse de votre projet Firebase. Pour un usage interne
avec des données simples (prénoms, points), c'est un compromis raisonnable
pour démarrer — mais **avant d'y mettre des données sensibles ou d'ouvrir
l'appli publiquement, il faudra ajouter une vraie authentification** (par
exemple Firebase Authentication) et des règles Firestore restrictives.
Dites-le-moi quand vous serez prêt·e pour cette étape, je vous guiderai.

Après les 30 jours de mode test, les règles se bloquent automatiquement.
Pour prolonger l'accès en gardant le même niveau (temporaire) de simplicité,
allez dans **Firestore Database → Règles** et remplacez le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /necAcademie/{document=**} {
      allow read, write: if true;
    }
  }
}
```

puis cliquez sur **"Publier"**.

---

## Étape 2 — Mettre le projet sur GitHub

GitHub va héberger le code source ; Vercel ira le chercher là pour le
déployer à chaque modification.

1. Allez sur **https://github.com** et créez un compte gratuit si besoin.
2. Cliquez sur le **"+"** en haut à droite → **"New repository"**.
3. Nom du dépôt : `nec-academie`. Laissez-le en **Public** ou **Private**
   (Private est très bien, Vercel y aura accès). Ne cochez aucune case
   d'initialisation. Cliquez sur **"Create repository"**.
4. Sur la page qui s'affiche, cliquez sur le lien **"uploading an existing
   file"**.
5. Sur votre ordinateur, ouvrez le dossier `nec-academie` que je vous ai
   fourni, sélectionnez **tout son contenu** (tous les fichiers et dossiers :
   `src`, `index.html`, `package.json`, `vite.config.js`, `.gitignore`,
   `.env.example`, `README.md`) et glissez-les dans la zone de dépôt GitHub.
   *(Ne créez pas de `.env` avec vos vraies clés à cette étape — on ne le
   met jamais sur GitHub, c'est pour cela qu'il est dans `.gitignore`.)*
6. En bas de page, cliquez sur **"Commit changes"**.

---

## Étape 3 — Déployer sur Vercel

1. Allez sur **https://vercel.com** et cliquez sur **"Sign Up"**, puis
   choisissez **"Continue with GitHub"** pour lier directement votre compte.
2. Une fois connecté, cliquez sur **"Add New..." → "Project"**.
3. Vercel liste vos dépôts GitHub : trouvez `nec-academie` et cliquez sur
   **"Import"**.
4. Vercel détecte automatiquement qu'il s'agit d'un projet **Vite** — les
   réglages par défaut (`npm run build`, dossier `dist`) sont corrects, ne
   changez rien.
5. **Avant de cliquer sur "Deploy"**, ouvrez la section **"Environment
   Variables"** et ajoutez les 6 clés récupérées à l'étape 1, une par une :

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | valeur `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | valeur `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | valeur `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | valeur `storageBucket` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | valeur `messagingSenderId` |
   | `VITE_FIREBASE_APP_ID` | valeur `appId` |

6. Cliquez sur **"Deploy"**. Après 1 à 2 minutes, Vercel vous donne une
   adresse du type `https://nec-academie-xxxx.vercel.app` — c'est votre
   application, en ligne, accessible depuis n'importe quel appareil.

---

## Et ensuite ?

- **Mettre à jour l'appli** : à chaque fois que vous (ou moi) modifiez le
  code et le renvoyez sur GitHub, Vercel redéploie automatiquement en
  quelques secondes.
- **Nom de domaine personnalisé** (ex. `academie.nec-natation.fr`) :
  possible gratuitement depuis Vercel → Project → Settings → Domains.
- **Vraie authentification** (comptes parents/éducateurs sécurisés) :
  prochaine étape recommandée avant un usage à grande échelle — dites-le
  moi quand vous voulez vous y mettre.
- **Tester en local avant de publier** (optionnel, nécessite d'installer
  Node.js) : copiez `.env.example` en `.env`, remplissez vos clés, puis
  dans un terminal, à l'intérieur du dossier du projet :
  ```
  npm install
  npm run dev
  ```
