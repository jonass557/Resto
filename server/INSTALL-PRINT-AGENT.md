# Installation de l'Agent d'Impression

## Comment ça fonctionne

```
PC d'impression (local)                   Cloud (Internet)
────────────────────────────              ──────────────────────────
1. server/ → tourne sur port 5000  ←───→  Render  (API principale)
2. Chrome  → ouvre le site web     ←───→  Vercel  (interface React)
```

**Tu n'as PAS besoin d'installer le frontend/client** sur ce PC.  
L'interface web est déjà hébergée sur Vercel — tu y accèdes simplement avec Chrome.

Le rôle du serveur local (port 5000) est uniquement de recevoir les commandes d'impression
et d'envoyer les données ESC/POS directement à l'imprimante via WiFi (TCP port 9100).

---

L'agent d'impression est le serveur local (`server/`) qui tourne sur le PC connecté à l'imprimante.  
Il écoute sur le port **5000** et reçoit les jobs d'impression depuis le serveur cloud (Render) via Socket.IO.

---

## Prérequis

- Windows 10 ou 11
- L'imprimante thermique connectée au **même réseau WiFi** que le PC
- Connexion Internet (pour communiquer avec le serveur cloud)

---

## Étape 1 — Installer Node.js

1. Télécharger Node.js LTS sur **https://nodejs.org**
2. Lancer l'installateur et suivre les étapes (tout laisser par défaut)
3. Vérifier l'installation : ouvrir **Invite de commandes** et taper :
   ```
   node -v
   npm -v
   ```
   Les deux commandes doivent afficher un numéro de version.

---

## Étape 2 — Copier le dossier serveur

Copier le dossier **`server/`** (contenu dans le projet) sur le PC d'impression.  
Exemple : `C:\PrintAgent\server\`

> Le dossier doit contenir : `src/`, `package.json`, `.env`, `start-print-agent.bat`

---

## Étape 3 — Configurer le fichier `.env`

Dans le dossier `server/`, ouvrir (ou créer) le fichier `.env` avec le Bloc-notes et y mettre :

```env
PORT=5000
MONGODB_URI=mongodb+srv://valdes557:manageResto237@manageresto.dhz0avh.mongodb.net/restaurant_db?retryWrites=true&w=majority&appName=manageResto
JWT_SECRET=f19f1942cf14a03a8cc80ab6e30b29dc53226f0648ffde33c3606a28f8431a49 *-
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=dq2cw4tyo
CLOUDINARY_API_KEY=822762149564633
CLOUDINARY_API_SECRET=bcOpM_zkDSYScp1-9LsVkYNYuZE
CLIENT_URL=https://manageresto-tawny.vercel.app,http://localhost:5173
NODE_ENV=production
CLOUD_SERVER_URL=https://manageresto-server.onrender.com
```

> **Important** : La ligne `CLOUD_SERVER_URL` est obligatoire pour que l'agent reçoive les jobs d'impression depuis le cloud (rapport global, tickets envoyés depuis l'app Vercel).  
> Remplacer l'URL par celle de ton serveur Render si elle est différente.

---

## Étape 4 — Installer les dépendances

Ouvrir **Invite de commandes en tant qu'Administrateur**, aller dans le dossier `server/` et lancer :

```
cd C:\PrintAgent\server
npm install
```

Attendre que l'installation se termine (peut prendre 1-2 minutes).

---

## Étape 5 — Tester le démarrage manuel

Toujours dans l'invite de commandes, lancer :

```
node src/index.js
```

Vous devez voir :
```
✅ MongoDB connecté
🚀 Serveur démarré sur le port 5000
```

Appuyer sur **Ctrl+C** pour arrêter. Passer à l'étape suivante.

---

## Étape 6 — Démarrage automatique au démarrage de Windows

### Méthode recommandée : Planificateur de tâches Windows

1. Appuyer sur `Win + S`, chercher **"Planificateur de tâches"** et l'ouvrir.

2. Dans le panneau droit, cliquer sur **"Créer une tâche..."**.

3. Onglet **Général** :
   - Nom : `Agent Impression Restaurant`
   - Cocher **"Exécuter même si l'utilisateur n'est pas connecté"**
   - Cocher **"Exécuter avec les autorisations maximales"**

4. Onglet **Déclencheurs** → cliquer **"Nouveau..."** :
   - Commencer la tâche : **"Au démarrage"**
   - Délai : **30 secondes** (laisse le temps au WiFi de se connecter)
   - Cliquer **OK**

5. Onglet **Actions** → cliquer **"Nouveau..."** :
   - Action : **"Démarrer un programme"**
   - Programme/script : parcourir jusqu'au fichier `start-print-agent.bat`  
     Exemple : `C:\PrintAgent\server\start-print-agent.bat`
   - Démarrer dans : `C:\PrintAgent\server`
   - Cliquer **OK**

6. Onglet **Conditions** :
   - **Décocher** "Démarrer la tâche uniquement si l'ordinateur est alimenté sur secteur"
   - Cocher **"Démarrer uniquement si la connexion réseau suivante est disponible"** → choisir **"Toute connexion"**

7. Onglet **Paramètres** :
   - Cocher **"Si la tâche échoue, redémarrer toutes les :"** → `1 minute`
   - Nombre de tentatives de redémarrage : `10`

8. Cliquer **OK** et entrer le mot de passe Windows si demandé.

---

## Étape 7 — Activer l'agent dans l'interface web

1. Se connecter à l'application sur le PC d'impression.
2. Aller dans **Paramètres → Imprimante**.
3. Activer le bouton **"Agent d'impression"**.
4. L'indicateur doit devenir vert : **"Agent actif"**.

---

## Vérification

Pour vérifier que l'agent tourne correctement, ouvrir un navigateur sur le PC local et accéder à :

```
http://localhost:5000/api/printer/status
```

La réponse doit être un JSON valide (même avec une erreur d'authentification — c'est normal sans token).

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| Port 5000 déjà utilisé | Changer `PORT=5001` dans `.env` et mettre à jour `PrintAgentContext.jsx` ligne 7 |
| `node` non reconnu | Réinstaller Node.js et redémarrer le PC |
| L'imprimante ne répond pas | Vérifier que l'IP de l'imprimante dans les paramètres est correcte et sur le même réseau |
| MongoDB connection error | Vérifier la connexion Internet du PC |
