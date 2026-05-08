# ============================================
# Script de lancement OFFLINE (MongoDB local + serveur)
# Usage: clic droit > "Executer avec PowerShell"
#   ou:  powershell -File start-local.ps1
# ============================================

$mongoDir = "C:\mongodb"
$mongoBin = $null

# Trouver mongod.exe (dans bin/ ou dans un sous-dossier extrait)
$candidates = @(
    "$mongoDir\bin\mongod.exe",
    (Get-ChildItem "$mongoDir\mongodb-*\bin\mongod.exe" -ErrorAction SilentlyContinue | Select-Object -First 1)
)
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $mongoBin = $c; break }
}

if (-not $mongoBin) {
    Write-Host "ERREUR: mongod.exe introuvable dans C:\mongodb\" -ForegroundColor Red
    Write-Host "Telecharge MongoDB ZIP depuis: https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4.zip"
    Write-Host "Extrait le contenu dans C:\mongodb\"
    Read-Host "Appuie sur Entree pour quitter"
    exit 1
}

# Creer le dossier data si necessaire
$dataDir = "$mongoDir\data"
if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

# Verifier si MongoDB tourne deja
$mongoRunning = Get-Process mongod -ErrorAction SilentlyContinue
if ($mongoRunning) {
    Write-Host "[OK] MongoDB deja en cours d'execution" -ForegroundColor Green
} else {
    Write-Host "[...] Demarrage de MongoDB..." -ForegroundColor Yellow
    Start-Process -FilePath $mongoBin -ArgumentList "--dbpath", $dataDir, "--port", "27017" -WindowStyle Minimized
    # Attendre que MongoDB soit pret (jusqu'a 20 secondes)
    $ready = $false
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 2
        try {
            $t = New-Object System.Net.Sockets.TcpClient; $t.Connect("127.0.0.1", 27017); $t.Close()
            $ready = $true; break
        } catch {}
    }
    if ($ready) {
        Write-Host "[OK] MongoDB demarre sur le port 27017" -ForegroundColor Green
    } else {
        Write-Host "[WARN] MongoDB lent a demarrer - le serveur va reessayer automatiquement" -ForegroundColor Yellow
    }
}

# Lancer le serveur Node.js
$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $serverDir "server"
Write-Host "[...] Demarrage du serveur restaurant..." -ForegroundColor Yellow
Write-Host "      Mode: LOCAL (offline)" -ForegroundColor Cyan
Write-Host ""

Set-Location $serverDir
node src/index.js --local
