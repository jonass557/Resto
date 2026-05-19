#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# Script de mise a jour de l'app sur la tablette (Termux)
# Usage: bash ~/gestion-restaurant/update-tablette.sh
# ============================================================

set -e

PROJECT_DIR="$HOME/gestion-restaurant"

echo ""
echo "============================================"
echo "  MISE A JOUR DE L'APPLICATION RESTAURANT"
echo "============================================"
echo ""

cd "$PROJECT_DIR"

echo "[1/5] Telechargement des modifications depuis GitHub..."
git pull origin main

echo ""
echo "[2/5] Installation des nouvelles dependances serveur..."
cd server
npm install --omit=dev

echo ""
echo "[3/5] Installation des nouvelles dependances client..."
cd ../client
npm install

echo ""
echo "[4/5] Reconstruction du frontend (peut prendre 5-10 min)..."
npm run build

echo ""
echo "[5/5] Redemarrage du serveur..."
cd "$PROJECT_DIR"
pkill -f "node.*src/index.js" || true
sleep 2
cd server
nohup node src/index.js --local > /tmp/restaurant-server.log 2>&1 &

sleep 3
echo ""
echo "============================================"
echo "  MISE A JOUR TERMINEE"
echo "============================================"
echo ""
echo "Serveur redemarre. Logs : tail -f /tmp/restaurant-server.log"
echo "Acces : http://localhost:5000"
echo ""
