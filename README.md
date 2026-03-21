# Restaurant Management System

Système de gestion de restauration SaaS complet avec deux interfaces : **Agent** et **Administrateur**.

## Stack Technique

- **Frontend** : React.js + Tailwind CSS + ShadCN UI + Recharts
- **Backend** : Node.js + Express.js
- **Base de données** : MongoDB + Mongoose
- **Authentification** : JWT
- **Temps réel** : Socket.io
- **Impression** : ESC/POS (imprimantes thermiques)

## Prérequis

- Node.js >= 18
- MongoDB (local ou Atlas)
- npm ou yarn

## Installation

```bash
# Installer toutes les dépendances
npm run install:all

# Ou manuellement:
cd server && npm install
cd ../client && npm install
```

## Configuration

1. Copier `server/.env.example` vers `server/.env`
2. Modifier les variables d'environnement (MongoDB URI, JWT secret, etc.)

## Démarrage

```bash
# Lancer en développement (backend + frontend)
npm run dev

# Ou séparément:
npm run dev:server   # Backend sur port 5000
npm run dev:client   # Frontend sur port 5173
```

## Données de démonstration

```bash
cd server && npm run seed
```

Cela crée :
- **Admin** : admin@restaurant.com / admin123
- **Agent** : agent@restaurant.com / agent123
- 6 catégories, 20 produits, 15 tables

## Fonctionnalités

### Interface Agent
- Gestion des commandes par table (POS)
- Impression automatique des tickets
- Regroupement en facture globale
- Caisse (ouverture/fermeture/historique/écarts)
- Gestion clients
- Paramètres personnels & imprimante

### Interface Administrateur
- Dashboard avec graphiques temps réel
- Supervision complète (commandes, tickets, agents)
- Gestion des utilisateurs (CRUD, rôles, activation)
- Gestion des produits & catégories
- Section ventes (journal, synthèse, palmarès)
- Comptabilité (journal, dépenses, grand livre, balance)
- Rapports détaillés avec export CSV
- Paramètres globaux (restaurant, imprimante, Mobile Money)

### Temps réel
Toutes les actions des agents sont visibles en temps réel par l'administrateur via Socket.io.

### Paiements
- Espèces, Carte bancaire, Mobile Money (MTN MoMo, Orange Money), Carte cadeau, Paiement mixte

## Structure du projet

```
├── server/
│   ├── src/
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # Express routes
│   │   ├── middleware/    # Auth middleware
│   │   ├── utils/        # Helpers
│   │   ├── seeds/        # Database seeding
│   │   └── index.js      # Entry point
│   └── .env
├── client/
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── contexts/     # React contexts
│   │   ├── pages/        # Agent & Admin pages
│   │   ├── services/     # API service
│   │   ├── lib/          # Utilities
│   │   └── App.jsx       # Router
│   └── index.html
└── package.json
```
