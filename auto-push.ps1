# Auto commit and push script
# Usage: .\auto-push.ps1 "your commit message"
# If no message provided, uses a default timestamped message

param(
    [string]$Message = ""
)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

if ($Message -eq "") {
    $Message = "Update: $timestamp"
}

Set-Location "c:\Users\WILLY\Documents\gestion de restaurant"

git add -A
git commit -m "$Message"
# push is handled automatically by post-commit hook
# but we also push explicitly as fallback
git push origin main

Write-Host "`n[OK] Code pushed to GitHub at $timestamp" -ForegroundColor Green
