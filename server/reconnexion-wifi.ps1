# Script de surveillance et reconnexion automatique WiFi
# Place dans le dossier server/, lance au demarrage via le Planificateur de taches

param(
    [string]$NomWifi = ""  # Laisser vide = reconnecte au dernier reseau connu
)

Write-Host "=== Surveillance WiFi demarree ===" -ForegroundColor Green
Write-Host "Reconnexion automatique activee"

$derniereConnexion = ""
$tentatives = 0

while ($true) {
    try {
        # Verifier si connecte a internet
        $wifi = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -like "*Wi*" -or $_.InterfaceAlias -like "*Wifi*" -or $_.InterfaceAlias -like "*Wireless*" }
        $internet = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet -ErrorAction SilentlyContinue

        if (-not $internet) {
            $tentatives++
            $heure = Get-Date -Format "HH:mm:ss"
            Write-Host "[$heure] WiFi perdu (tentative $tentatives) - reconnexion..." -ForegroundColor Yellow

            # Desactiver puis reactiver l'adaptateur WiFi
            $adaptateur = Get-NetAdapter | Where-Object { $_.Name -like "*Wi*" -or $_.Name -like "*Wifi*" -or $_.Name -like "*Wireless*" } | Select-Object -First 1

            if ($adaptateur) {
                Disable-NetAdapter -Name $adaptateur.Name -Confirm:$false -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                Enable-NetAdapter -Name $adaptateur.Name -Confirm:$false -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 8

                # Si un nom de reseau est specifie, forcer la connexion
                if ($NomWifi -ne "") {
                    netsh wlan connect name="$NomWifi" | Out-Null
                    Start-Sleep -Seconds 5
                }
            }

            # Verifier si reconnecte
            $internetApres = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet -ErrorAction SilentlyContinue
            if ($internetApres) {
                Write-Host "[$heure] Reconnecte avec succes !" -ForegroundColor Green
                $tentatives = 0
            }
        } else {
            if ($tentatives -gt 0) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Connexion retablie." -ForegroundColor Green
                $tentatives = 0
            }
        }
    } catch {
        # Ignorer les erreurs silencieusement
    }

    # Verifier toutes les 30 secondes
    Start-Sleep -Seconds 30
}
