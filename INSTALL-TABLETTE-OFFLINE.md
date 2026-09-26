# Installation tablette OFFLINE — Restaurant Manager

Guide complet pour installer le système de gestion sur une **tablette Windows**
qui fonctionne **sans connexion Internet**, avec **démarrage automatique permanent**
et **impression WiFi locale** vers une imprimante thermique.

---

## 1. Architecture cible

```
┌─────────────────────────────────────────────────────┐
│            Routeur / Hotspot WiFi local             │
│        (réseau privé sans Internet)                 │
└──────┬──────────────────────────────┬───────────────┘
       │                              │
   ┌───▼─────────────┐         ┌──────▼─────────┐
   │  Tablette       │         │  Imprimante    │
   │  Windows        │  TCP    │  thermique     │
   │  ─ Node serveur │ ──9100► │  ESC/POS       │
   │  ─ MongoDB      │         │  IP fixe       │
   │  ─ Chrome       │         │                │
   └─────────────────┘         └────────────────┘
       │
       └── Sync Cloud quand Internet revient
           (CLOUD_API_URL → MongoDB Atlas)
```

- **La tablette est le serveur** : tout (web app + DB + impression) tourne dessus.
- Les agents accèdent via **`http://localhost:5000`** dans Chrome.
- L'imprimante est sur le **même WiFi** que la tablette (port TCP 9100).
- Quand Internet revient → bouton **« Cloud à jour »** synchronise avec le cloud.

---

## 2. Prérequis matériel

| Élément | Recommandé |
|---|---|
| Tablette | Windows 10/11, 4 Go RAM mini, 64 Go stockage |
| Imprimante | Thermique 80mm avec interface **WiFi/Ethernet** + ESC/POS (Epson TM-T20III, Xprinter XP-N160II, etc.) |
| Routeur | TP-Link / mini-routeur portable — **aucune SIM/Internet requis**, sert juste de réseau local |

> Si tu n'as pas de routeur dédié, la tablette peut faire **point d'accès mobile** (voir §6).

---

## 3. Installation logicielle (à faire **une seule fois** sur la tablette)

### 3.1 Node.js LTS

1. Télécharger l'installeur **node-vXX-x64.msi** depuis https://nodejs.org sur un PC connecté
2. Copier le `.msi` sur la tablette via clé USB
3. Double-clic → suivre l'installeur (tout par défaut)
4. Vérifier dans **Invite de commandes** :
   ```
   node -v
   npm -v
   ```

### 3.2 MongoDB local (offline)

1. Télécharger le **ZIP** : https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4.zip
2. Extraire le contenu dans **`C:\mongodb\`**
   - Doit donner `C:\mongodb\bin\mongod.exe`
3. Créer le dossier de données : `C:\mongodb\data\`

### 3.3 Code du projet

1. Copier le dossier complet du projet sur la tablette :
   - **`C:\restaurant\`** ← chemin recommandé
2. Ouvrir **Invite de commandes en Administrateur** :
   ```
   cd C:\restaurant\server
   npm install
   cd ..\client
   npm install
   ```
3. Construire le frontend pour le mode local :
   ```
   cd C:\restaurant\client
   npm run build
   ```
   > Le build utilise automatiquement `client/.env.production.local` (qui doit
   > contenir `VITE_API_URL=/api`). Si ce fichier n'existe pas, le créer.

### 3.4 Fichier de config local du serveur

Créer (ou modifier) **`C:\restaurant\server\.env.local`** :

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/restaurant_db
JWT_SECRET=f19f1942cf14a03a8cc80ab6e30b29dc53226f0648ffde33c3606a28f8431a49
JWT_EXPIRES_IN=7d

CLIENT_URL=http://localhost:5000
NODE_ENV=production
LOCAL_MODE=true

# URL du serveur cloud — utilisée uniquement quand Internet est dispo,
# pour pousser les ventes du jour vers le dashboard admin en ligne.
CLOUD_API_URL=https://votre-nouveau-serveur.onrender.com

# Identifiants admin du cloud — pour que le local s'authentifie
# automatiquement au cloud lors du sync push/pull.
CLOUD_ADMIN_EMAIL=admin@restaurant.com
CLOUD_ADMIN_PASSWORD=199211
```

### 3.5 Initialiser la base locale (1ère fois)

Avec Internet, lance une fois :
```
cd C:\restaurant\server
node src/index.js --local
```
Puis dans Chrome : `http://localhost:5000` → connecte-toi en admin →
**Paramètres → Cloud → Tirer du cloud (pull-all)** pour récupérer
utilisateurs, produits, catégories et tables depuis le cloud.

Tu peux ensuite couper Internet — la base locale est prête.

---

## 4. Démarrage automatique permanent (le serveur ne s'arrête JAMAIS)

Trois mécanismes superposés pour garantir la disponibilité :

### 4.1 Service Windows via **NSSM** (recommandé — robuste)

NSSM transforme le serveur Node en **service Windows** qui :
- démarre avant la session utilisateur (dès le boot)
- redémarre automatiquement s'il plante
- ne dépend d'aucune fenêtre console ouverte

#### Installation NSSM

1. Télécharger https://nssm.cc/release/nssm-2.24.zip
2. Extraire `nssm.exe` (version `win64`) dans `C:\nssm\nssm.exe`

#### Créer le service MongoDB

Ouvrir **Invite de commandes Administrateur** :
```cmd
C:\nssm\nssm.exe install MongoDB "C:\mongodb\bin\mongod.exe" "--dbpath" "C:\mongodb\data" "--port" "27017"
C:\nssm\nssm.exe set MongoDB Start SERVICE_AUTO_START
C:\nssm\nssm.exe start MongoDB
```

#### Créer le service Restaurant

```cmd
C:\nssm\nssm.exe install RestaurantServer "C:\Program Files\nodejs\node.exe" "src\index.js" "--local"
C:\nssm\nssm.exe set RestaurantServer AppDirectory "C:\restaurant\server"
C:\nssm\nssm.exe set RestaurantServer DependOnService MongoDB
C:\nssm\nssm.exe set RestaurantServer Start SERVICE_AUTO_START
C:\nssm\nssm.exe set RestaurantServer AppStdout "C:\restaurant\logs\server.log"
C:\nssm\nssm.exe set RestaurantServer AppStderr "C:\restaurant\logs\error.log"
C:\nssm\nssm.exe set RestaurantServer AppRestartDelay 5000
C:\nssm\nssm.exe start RestaurantServer
```

> Crée d'abord le dossier `C:\restaurant\logs\` à la main.

#### Vérifier

- `Win + R` → `services.msc` → tu dois voir **MongoDB** et **RestaurantServer** en état **« En cours d'exécution »** avec **Type de démarrage = Automatique**.
- Test : `http://localhost:5000/api/health` → doit répondre `{"status":"ok"}`.

#### Désinstaller (au besoin)

```cmd
C:\nssm\nssm.exe stop RestaurantServer
C:\nssm\nssm.exe remove RestaurantServer confirm
C:\nssm\nssm.exe stop MongoDB
C:\nssm\nssm.exe remove MongoDB confirm
```

### 4.2 Raccourci Chrome **kiosque** sur le bureau (pour les agents)

Pour que les agents lancent l'app en un clic, sans connaître l'URL :

1. Clic droit sur le bureau → **Nouveau → Raccourci**
2. Emplacement :
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --disable-pinch http://localhost:5000
   ```
3. Nommer : **Restaurant**
4. Optionnel : épingler à la barre des tâches

> Mode kiosque = plein écran, pas d'onglet, pas de barre URL → impossible pour
> l'agent de naviguer ailleurs ou de fermer accidentellement.

### 4.3 (Bonus) Démarrer Chrome au login

`Win + R` → `shell:startup` → glisser le raccourci Chrome dedans.
À chaque allumage de la tablette : Windows démarre → MongoDB + Serveur démarrent
en service → l'utilisateur se connecte → Chrome s'ouvre en kiosque sur l'app.
**L'agent n'a rien à faire.**

---

## 5. Configurer l'imprimante thermique WiFi

### 5.1 Donner une IP fixe à l'imprimante

Dans le menu de l'imprimante (ou son utilitaire fourni) :
- **DHCP : OFF**
- **IP fixe** : par exemple `192.168.1.50`
- **Masque** : `255.255.255.0`
- **Passerelle** : IP du routeur (ex. `192.168.1.1`)

> Si l'imprimante ne supporte que le DHCP, configure une **réservation DHCP**
> dans le routeur pour que son IP ne change jamais.

### 5.2 Vérifier la connectivité depuis la tablette

Dans **Invite de commandes** sur la tablette :
```
ping 192.168.1.50
```
Doit répondre. Sinon : la tablette n'est pas sur le bon WiFi ou l'imprimante est éteinte.

### 5.3 Tester le port d'impression (TCP 9100)

```powershell
Test-NetConnection -ComputerName 192.168.1.50 -Port 9100
```
`TcpTestSucceeded : True` → l'imprimante est joignable.

### 5.4 Renseigner l'IP dans l'app

1. Ouvrir `http://localhost:5000` (mode admin)
2. **Paramètres → Imprimante**
   - IP : `192.168.1.50`
   - Port : `9100`
   - Activer **« Agent d'impression »**
3. Cliquer **« Tester l'impression »** → un ticket de test sort.

À partir de là, **chaque commande validée par un agent imprime automatiquement**
le ticket cuisine, et chaque facture validée par un caissier imprime la facture.

---

## 6. Réseau WiFi local **sans Internet** (tablette ↔ imprimante)

Trois options selon ton matériel :

### Option A — Routeur WiFi dédié (recommandé)

1. Brancher le routeur sur secteur (pas besoin de câble Internet).
2. SSID au choix : `restaurant-local`, mot de passe au choix.
3. Connecter la tablette à `restaurant-local`.
4. Connecter l'imprimante à `restaurant-local` (via son menu WiFi ou WPS).
5. La tablette + imprimante sont maintenant sur **le même réseau privé sans Internet**.

> **Coût** : ~15 000 FCFA pour un routeur basique. **Recommandé** car le réseau
> reste stable même si tu redémarres la tablette.

### Option B — Point d'accès mobile Windows (gratuit)

Si tu n'as pas de routeur, la tablette peut elle-même créer le WiFi :

1. **Paramètres Windows → Réseau et Internet → Point d'accès mobile**
2. Activer **Point d'accès mobile**
3. **Modifier** :
   - Nom du réseau : `restaurant-local`
   - Mot de passe : à ton choix
   - Bande : `2,4 GHz` (la plupart des imprimantes ne supportent pas 5 GHz)
4. **Partager ma connexion Internet depuis** : `Wi-Fi` (peu importe, car il n'y aura pas de WAN)

⚠️ **Inconvénient** : la tablette doit être allumée pour que le réseau existe ; l'imprimante perd la connexion si la tablette s'éteint. Avec un routeur dédié, c'est plus stable.

### Option C — Câble Ethernet direct

Si l'imprimante a un port RJ45 et la tablette aussi (ou via adaptateur USB-Ethernet) :
- Câble croisé direct **tablette ↔ imprimante**
- Configurer une IP fixe `192.168.1.10` sur la tablette et `192.168.1.50` sur l'imprimante
- Aucune perte ni interférence WiFi

---

## 7. Synchronisation cloud **automatique quand Internet revient**

L'app détecte la connectivité et :
- en **offline** : tout fonctionne sur la base locale ; les écritures sont stockées avec `syncedToCloud=false`
- quand Internet revient : un **auto-sync** envoie au cloud (ou clic manuel sur **« Cloud à jour »** dans le bouton du header admin)

> Le détail technique : `@c:\Users\DELL\Documents\gestion de restaurant\server\src\routes\sync.js` (push), reçu par le serveur Render.

---

## 8. Procédures pour les agents (à imprimer et coller sur la tablette)

### Allumer la tablette
1. Appuyer sur le bouton **Power**.
2. Attendre 1 minute (Windows démarre, services démarrent).
3. Se connecter à la session Windows.
4. Chrome s'ouvre tout seul sur l'app **Restaurant**.
5. Saisir email + mot de passe → **Se connecter**.

### Si l'imprimante n'imprime pas
1. Vérifier que l'imprimante est **allumée** et a du papier.
2. Vérifier que la tablette est connectée au WiFi `restaurant-local`.
3. Cliquer sur **Paramètres → Imprimante → Tester** dans l'app.
4. Si le test échoue : éteindre/rallumer l'imprimante, puis recliquer **Tester**.
5. Si toujours en panne : appeler l'admin (l'imprimante a peut-être perdu son IP fixe).

### Éteindre la tablette
1. **Toujours** terminer le service en cours (clôturer la caisse) avant.
2. Cliquer sur **Cloud à jour** si Internet est dispo (envoie les ventes du jour).
3. Menu Démarrer → **Arrêter**.

---

## 9. Checklist installation finale

- [ ] Node.js installé (`node -v` répond)
- [ ] MongoDB extrait dans `C:\mongodb\`
- [ ] Projet copié dans `C:\restaurant\`
- [ ] `npm install` exécuté côté server ET client
- [ ] `npm run build` exécuté côté client
- [ ] `.env.local` rempli côté server
- [ ] `pull-all` lancé une fois (avec Internet) pour peupler la base
- [ ] Service Windows **MongoDB** créé via NSSM, état "En cours"
- [ ] Service Windows **RestaurantServer** créé via NSSM, état "En cours"
- [ ] `http://localhost:5000/api/health` répond
- [ ] Imprimante : IP fixe configurée et `ping` OK
- [ ] Test impression depuis l'app fonctionne
- [ ] Raccourci Chrome kiosque sur le bureau + démarrage auto
- [ ] Test : redémarrer la tablette → tout doit se relancer **sans intervention**

---

## 10. Diagnostic rapide

| Symptôme | Cause probable | Action |
|---|---|---|
| `localhost:5000` ne charge pas | Service `RestaurantServer` arrêté | `services.msc` → clic droit **RestaurantServer** → **Démarrer** |
| « MongoDB connection error » dans les logs | Service `MongoDB` arrêté | Idem avec **MongoDB** |
| Impression KO | Imprimante éteinte ou IP changée | `ping <IP imprimante>` ; vérifier WiFi |
| App lente après plusieurs jours offline | Cache navigateur | Ctrl+Shift+R sur la page |
| Synchro cloud échoue | CLOUD_ADMIN_PASSWORD incorrect dans `.env.local` | Vérifier les identifiants |

Logs serveur en temps réel :
```
Get-Content C:\restaurant\logs\server.log -Wait -Tail 50
```
