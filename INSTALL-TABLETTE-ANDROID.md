# Installation sur tablette Android (Termux + Ubuntu proot)

Guide pour faire tourner **le serveur Restaurant Manager directement sur une
tablette Android**, sans Internet, avec démarrage automatique et impression WiFi.

> **Avant de commencer**, lis les avertissements à la fin du guide (§9).
> Ce setup est **fragile par nature** sur Android. Une tablette dédiée,
> branchée en permanence, est obligatoire.

---

## 1. Architecture

```
┌────────── Routeur WiFi local (sans Internet) ──────────┐
│                                                         │
│  ┌────────────────────────────┐   ┌──────────────────┐ │
│  │ Tablette Android           │   │ Imprimante       │ │
│  │  ┌──────────────────────┐  │   │ thermique WiFi   │ │
│  │  │ Termux               │  │   │ 192.168.1.50     │ │
│  │  │  └─ Ubuntu (proot)   │──┼──►│ port TCP 9100    │ │
│  │  │      ├─ Node serveur │  │   │                  │ │
│  │  │      └─ MongoDB      │  │   └──────────────────┘ │
│  │  └──────────────────────┘  │                        │
│  │  ┌──────────────────────┐  │                        │
│  │  │ Chrome (PWA)         │  │                        │
│  │  │  → http://localhost  │  │                        │
│  │  │     :5000            │  │                        │
│  │  └──────────────────────┘  │                        │
│  └────────────────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

Tout tourne sur la même tablette. Chrome accède à `localhost:5000`.

---

## 2. Prérequis

- Tablette Android **8.0+**, **3 Go RAM mini**, **32 Go libres**
- **Connexion Internet temporaire** pour l'installation (1 fois seulement)
- Câble chargeur (la tablette restera branchée)
- Compte F-Droid OU possibilité de télécharger des APK hors Play Store

---

## 3. Installer Termux et add-ons (depuis F-Droid uniquement)

⚠️ **Ne PAS utiliser la version Termux du Play Store** — elle est obsolète et ne reçoit plus de mises à jour de paquets.

1. Télécharger et installer **F-Droid** : https://f-droid.org
2. Dans F-Droid, installer ces 2 apps :
   - **Termux**
   - **Termux:Boot** (pour le démarrage auto)

---

## 4. Configuration Android critique

Sans ces réglages, Android va tuer ton serveur en arrière-plan :

### 4.1 Désactiver l'optimisation batterie pour Termux

`Paramètres → Applications → Termux → Batterie → Sans restriction`

Idem pour **Termux:Boot**.

### 4.2 Empêcher la mise en veille

`Paramètres → Affichage → Veille → Jamais`
(ou installer l'app **« Caffeine »** si l'option « Jamais » est absente)

### 4.3 Désactiver le verrouillage automatique

`Paramètres → Sécurité → Verrouillage écran → Aucun`

### 4.4 Activer l'épinglage d'écran (anti-fugue agent)

`Paramètres → Sécurité → Avancé → Épinglage de l'écran → ON`

---

## 5. Installation logicielle dans Termux

Ouvrir Termux et **copier-coller** chaque bloc.

### 5.1 Préparer Termux

```bash
pkg update -y && pkg upgrade -y
pkg install -y proot-distro git nodejs-lts wget
termux-setup-storage   # Autoriser l'accès au stockage quand ça demande
```

### 5.2 Installer Ubuntu dans proot

```bash
proot-distro install ubuntu
proot-distro login ubuntu
```

À partir de là, tu es **dans Ubuntu**. Le prompt change.

### 5.3 Installer MongoDB et Node dans Ubuntu

```bash
apt update -y && apt upgrade -y
apt install -y curl gnupg ca-certificates

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git

# MongoDB 7.0 (build ARM64 officiel pour Ubuntu)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [arch=arm64,amd64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update -y
apt install -y mongodb-org

# Créer le dossier data
mkdir -p /data/db

# Test rapide MongoDB
mongod --dbpath /data/db --fork --logpath /var/log/mongod.log --bind_ip 127.0.0.1
sleep 3
mongosh --eval "db.runCommand({ ping: 1 })"
mongod --shutdown --dbpath /data/db
```

Si le `ping` répond `{ ok: 1 }`, MongoDB fonctionne.

### 5.4 Cloner le projet

```bash
cd /root
git clone https://github.com/valdes557/manageResto.git restaurant
cd restaurant/server
npm install --omit=dev
```

### 5.5 Construire le frontend

> Le build React est lourd. Si la tablette a peu de RAM, **construis le `dist/`
> sur un PC avec `npm run build`** (dans `client/`) puis copie le dossier
> `client/dist/` sur la tablette via USB. Sinon, sur la tablette :

```bash
cd /root/restaurant/client
npm install
npm run build
```

### 5.6 Créer le fichier de config serveur

```bash
cat > /root/restaurant/server/.env.local << 'EOF'
PORT=5000
MONGODB_URI=mongodb://localhost:27017/restaurant_db
JWT_SECRET=f19f1942cf14a03a8cc80ab6e30b29dc53226f0648ffde33c3606a28f8431a49
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5000
NODE_ENV=production
LOCAL_MODE=true
CLOUD_API_URL=https://votre-nouveau-serveur.onrender.com
CLOUD_ADMIN_EMAIL=admin@restaurant.com
CLOUD_ADMIN_PASSWORD=199211
EOF
```

### 5.7 Premier lancement (avec Internet)

```bash
mongod --dbpath /data/db --fork --logpath /var/log/mongod.log --bind_ip 127.0.0.1
cd /root/restaurant/server
node src/index.js --local
```

Sur Chrome (même tablette) → `http://localhost:5000` → connexion admin →
**Paramètres → Cloud → Tirer du cloud (pull-all)** pour peupler la base.

Puis `Ctrl+C` dans Termux pour arrêter.

---

## 6. Démarrage automatique permanent

### 6.1 Script de démarrage Ubuntu

Toujours **dans Ubuntu (proot)** :

```bash
cat > /root/start-restaurant.sh << 'EOF'
#!/bin/bash
# Démarre MongoDB puis le serveur Node, redémarre auto en cas de crash

# 1) MongoDB en arrière-plan
if ! pgrep -x mongod > /dev/null; then
  mongod --dbpath /data/db --fork --logpath /var/log/mongod.log --bind_ip 127.0.0.1
  sleep 5
fi

# 2) Boucle Node : redémarre si plante
cd /root/restaurant/server
while true; do
  node src/index.js --local >> /var/log/restaurant.log 2>&1
  echo "[$(date)] Server crashed, restarting in 5s..." >> /var/log/restaurant.log
  sleep 5
done
EOF
chmod +x /root/start-restaurant.sh
```

### 6.2 Sortir d'Ubuntu et créer le script Termux:Boot

```bash
exit   # Quitter Ubuntu, retour à Termux
```

Maintenant créer le script qui sera lancé au boot de la tablette par Termux:Boot :

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-restaurant << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
# Empêcher la veille de Termux
termux-wake-lock

# Lancer Ubuntu et le script de démarrage
proot-distro login ubuntu -- /root/start-restaurant.sh
EOF
chmod +x ~/.termux/boot/start-restaurant
```

### 6.3 Lancer le service maintenant (sans rebooter)

```bash
~/.termux/boot/start-restaurant &
```

Vérifier dans Chrome : `http://localhost:5000/api/health` doit répondre.

### 6.4 Test du redémarrage

**Redémarre la tablette**. Après ~1 minute, ouvre Chrome → `http://localhost:5000`
doit charger l'app **sans avoir touché à Termux**.

> Si ça ne démarre pas auto : vérifier que **Termux:Boot a bien été lancé au moins une fois** manuellement après installation (ouvrir l'app Termux:Boot dans le tiroir d'apps).

---

## 7. Configurer l'imprimante WiFi

Identique à un setup Windows :

1. Imprimante : **IP fixe** `192.168.1.50` via son menu
2. Tablette : se connecter au même WiFi `restaurant-local`
3. Tester depuis Termux :
   ```bash
   pkg install iputils
   ping -c 3 192.168.1.50
   ```
4. Dans l'app web (Chrome) : **Paramètres → Imprimante → IP `192.168.1.50` Port `9100`**
5. Activer **Agent d'impression** → **Tester** → un ticket sort

L'impression part du serveur Node (dans Ubuntu/proot) vers l'imprimante via le WiFi local. **Aucune connexion Internet n'est requise**.

---

## 8. Empêcher l'agent de quitter l'app

Sur la tablette :

1. Ouvrir Chrome → `http://localhost:5000`
2. Menu Chrome (⋮) → **Ajouter à l'écran d'accueil** → ça crée une icône PWA plein écran
3. Lancer l'icône PWA depuis l'écran d'accueil
4. **Bouton multitâche** (carré) → tap sur l'**icône d'épingle** sur l'aperçu de l'app
5. L'agent ne peut plus quitter sans entrer le code PIN/mot de passe Android

---

## 9. ⚠️ Limites connues

| Problème | Atténuation |
|---|---|
| Android tue Termux après quelques heures de batterie faible | Tablette branchée H24 + désactivation optimisation batterie |
| Mise à jour Android peut casser proot/Termux | Désactive les MAJ auto système : `Paramètres → Système → Mises à jour → désactiver auto` |
| Tablette redémarre sans démarrer Termux:Boot | Ouvre Termux:Boot une fois manuellement après chaque MAJ d'Android |
| Carte SD/eMMC qui se remplit | Surveille `df -h` ; vide les logs `/var/log/restaurant.log` régulièrement |
| Performances faibles si <3 Go RAM | Builder le `client/dist/` sur PC et juste le copier ; ne pas faire `npm install` du client sur la tablette |
| Si Mongo se corrompt (kill brutal) | Lancer `mongod --repair --dbpath /data/db` depuis Ubuntu |

---

## 10. Diagnostic rapide

```bash
# Dans Termux
proot-distro login ubuntu

# Statut MongoDB
pgrep -x mongod && echo "MongoDB OK" || echo "MongoDB DOWN"

# Statut Node
pgrep -f "node src/index.js" && echo "Node OK" || echo "Node DOWN"

# Logs
tail -f /var/log/restaurant.log
tail -f /var/log/mongod.log

# Redémarrer tout proprement
pkill -f "node src/index.js"
pkill -x mongod
/root/start-restaurant.sh &
```

---

## 11. Si ça devient trop fragile

Reviens à l'**Option A (mini-PC dédié)** documentée dans
`@c:\Users\DELL\Documents\gestion de restaurant\INSTALL-TABLETTE-OFFLINE.md` :
le mini-PC fait serveur, la tablette Android n'est plus que cliente.
Coût ~100 000 FCFA, mais zéro maintenance.
