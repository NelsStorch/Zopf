param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'dev',

    # Leaves out the database dump that is otherwise taken before every deploy.
    [switch]$SkipBackup,

    # Emergencies only: deploy to prod without a pushed, CI-checked state that ran on dev first.
    [switch]$Force
)

# Deploys what is in this folder right now (not what is committed) to the server:
#   1. packs the project without node_modules, build output, .env files and dumps
#   2. dumps the database on the server (the last 10 dumps are kept)
#   3. unpacks and builds the images while the running containers keep serving
#   4. runs the database migrations in the new image: if they fail, the new code never starts
#   5. swaps backend and frontend one by one (docker rollout, falls back to compose up)
#   6. waits until API and website answer, and only then reports success
# Every image is also tagged with the git state; the running state is in REVISION on the
# server, the last 7 deployed states in .revisions. Each deploy reports to Discord.
#
# .env files on the server are never touched. One-off imports are separate steps.

# UTF-8 for the console and the webhook payload
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Special characters by code point: PowerShell 5.1 reads scripts without BOM as ANSI
# and would otherwise send garbled emojis to Discord.
$IconRocket    = [char]::ConvertFromUtf32(0x1F680)
$IconCross     = [char]::ConvertFromUtf32(0x274C)
$IconHourglass = [char]::ConvertFromUtf32(0x23F3)
$Dot           = [char]0x00B7

# Server address and webhook live outside git in deploy.config.ps1.
$ConfigFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "deploy.config.ps1 fehlt: Vorlage deploy.config.example.ps1 kopieren und ausfuellen." -ForegroundColor Red
    exit 1
}
. $ConfigFile

$ProjectName = "zopf-$Environment"
$RemoteDir = "$RemoteBase/$ProjectName"
$ArchiveName = "deploy.tar.gz"
$RemoteScript = "deploy-remote.sh"
# Default proxy network; PROXY_NETWORK in the server's .env wins (read on the server).
$ProxyNetwork = "zopf_${Environment}_proxy"
$Services = "backend frontend"

# No domains here: the address of each installation is APP_DOMAIN in the .env on the server.
if ($Environment -eq 'dev') {
    $ComposeFile = "docker-compose.staging.yml"
    $Prefix = "zopf-dev"
} else {
    $ComposeFile = "docker-compose.yml"
    $Prefix = "zopf"
}
$StartTime = Get-Date

function Step($text) {
    $script:CurrentStep = $text
    Write-Host "`n$text" -ForegroundColor Cyan
}

# Discord limits: field value 1024, description 4096 characters
function Limit-Text([string]$text, [int]$max) {
    if ($text.Length -le $max) { return $text }
    return $text.Substring(0, $max - 3) + "..."
}

# $fields: list of @{ name = ...; value = ...; inline = $true/$false } (empty values are left out)
function Send-DiscordNotification($title, $description, $color = 14753096, $fields = @(), $url = $null) {
    $webhook = if ($DiscordWebhookUrl) { $DiscordWebhookUrl } else { $env:DISCORD_WEBHOOK_URL }
    if (-not $webhook) { return }

    $embed = @{
        title = $title
        description = (Limit-Text $description 4000)
        color = $color
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        footer = @{ text = "Zopfaktion $Dot $Environment" }
    }
    if ($url) { $embed.url = $url }
    $cleanFields = @($fields | Where-Object { $_ -and $_.value } | ForEach-Object {
        @{ name = $_.name; value = (Limit-Text ([string]$_.value) 1000); inline = [bool]$_.inline }
    })
    if ($cleanFields.Count -gt 0) { $embed.fields = $cleanFields }

    $payload = @{
        username = "Zopfaktion Deploy"
        embeds = @($embed)
    } | ConvertTo-Json -Depth 6

    try {
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        Invoke-RestMethod -Uri $webhook -Method Post -Body $bodyBytes -ContentType "application/json; charset=utf-8" -UserAgent "ZopfaktionDeploy/1.0" -TimeoutSec 5 | Out-Null
    } catch {
        # A Discord problem never stops a deploy.
    }
}

# Current step (for the failure message) and the server output (for evaluation and details)
$script:CurrentStep = "Vorbereitung"
$script:RemoteOutput = @()

$RepoUrl = (git remote get-url origin 2>$null) -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
$DeployedBy = git config user.name 2>$null
if (-not $DeployedBy) { $DeployedBy = $env:USERNAME }

function Get-CommitLink($rev) {
    if ($RepoUrl -and $rev -match '^[0-9a-f]{7,40}$') { return "[``$rev``]($RepoUrl/commit/$rev)" }
    return "``$rev``"
}

function Stop-Deploy($text) {
    Write-Host "`nDEPLOY FEHLGESCHLAGEN: $text" -ForegroundColor Red
    # No server address in the message (Discord is not a protected place).
    $info = "**Grund:** $text`n**Schritt:** $($script:CurrentStep)"
    if ($commit) { $info += "`n**Stand:** $commit" }
    $fields = @()
    $backupLine = $script:RemoteOutput | Where-Object { $_ -match '^Backup: ' } | Select-Object -First 1
    if ($backupLine) { $fields += @{ name = "Sicherung"; value = "``$($backupLine -replace '^Backup: ', '')``" } }
    $tail = @($script:RemoteOutput | Where-Object { $_ -and $_.Trim() } | Select-Object -Last 12) -join "`n"
    if ($tail) { $fields += @{ name = "Letzte Ausgabe"; value = "```````n$(Limit-Text $tail 950)`n``````" } }
    $fields += @{ name = "Was jetzt?"; value = "Bereits getauschte Dienste laufen auf dem neuen Stand, die uebrigen auf dem alten. Die Datenbank vor dem Deploy liegt unter ``$ProjectName/backups``. Zuruecksetzen: ``.\rollback.ps1 $Environment -List``" }
    Send-DiscordNotification -title "$IconCross Deployment fehlgeschlagen ($Environment)" -description $info -color 15158332 -fields $fields
    Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue
    exit 1
}

Set-Location $PSScriptRoot
Write-Host "Deploy nach $Environment ($RemoteDir auf $Server)" -ForegroundColor Cyan

# What exactly goes out: the folder as it is, so say so when it differs from git.
$commit = git log --oneline -1 2>$null
$dirty = @(git status --porcelain 2>$null)
if ($commit) { Write-Host "Stand: $commit" }
# Git state for image tags and REVISION, clearly marked when uncommitted files go along.
$revision = git rev-parse --short HEAD 2>$null
if (-not $revision) { $revision = "unknown" }
$revisionFull = git rev-parse HEAD 2>$null
if (-not $revisionFull) { $revisionFull = "unknown" }
if ($dirty.Count -gt 0) { $revision = "$revision-dirty-$(Get-Date -Format yyyyMMddHHmmss)" }
Write-Host "Revision: $revision"
if ($dirty.Count -gt 0) {
    Write-Host "Achtung: $($dirty.Count) Datei(en) sind nicht committet und gehen trotzdem mit:" -ForegroundColor Yellow
    $dirty | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# Prod only gets a state the CI has checked: all committed, on master, pushed, the CI run
# for exactly this commit is green, and it ran on dev before. Dev stays free for trying
# things out. Emergency: -Force (noted in Discord).
function Test-ProdReady {
    if ($dirty.Count -gt 0) { return "Es gibt nicht committete Dateien." }
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($branch -ne 'master') { return "Prod wird nur von master deployt (aktuell: $branch)." }
    git fetch --quiet origin master 2>$null
    if ($LASTEXITCODE -ne 0) { return "git fetch origin master ist fehlgeschlagen." }
    $remote = git rev-parse origin/master 2>$null
    if ($remote -ne $revisionFull) { return "Der Stand ist nicht gepusht oder nicht aktuell (origin/master: $($remote.Substring(0, [Math]::Min(7, "$remote".Length))))." }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { return "GitHub CLI (gh) fehlt, die CI laesst sich nicht pruefen." }
    $runsJson = gh run list --workflow CI --commit $revisionFull --event push --json status,conclusion,url --limit 5 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $runsJson) { return "Die CI-Laeufe konnten nicht abgefragt werden (gh auth status?)." }
    $runs = @($runsJson | ConvertFrom-Json)
    if ($runs.Count -eq 0) { return "Fuer diesen Commit gibt es keinen CI-Lauf." }
    $run = $runs[0]
    if ($run.status -ne 'completed') { return "Die CI laeuft noch ($($run.url)). Bitte warten, bis sie gruen ist." }
    if ($run.conclusion -ne 'success') { return "Die CI ist nicht gruen ($($run.conclusion), $($run.url))." }
    Write-Host "CI gruen fuer $revision ($($run.url))" -ForegroundColor Green

    # Exactly this state must have been deployed to dev before (noted there in .revisions).
    $devRevisions = @(ssh -n -o ConnectTimeout=30 $Server "cat $RemoteBase/zopf-dev/.revisions 2>/dev/null")
    if ($LASTEXITCODE -ne 0) { return "Die Dev-Staende auf dem Server konnten nicht gelesen werden." }
    if ($devRevisions -notcontains $revision) {
        return "Dieser Stand ($revision) lief noch nie auf Dev. Zuerst .\deploy.ps1 dev und dort pruefen."
    }
    $devCurrent = "$(ssh -n -o ConnectTimeout=30 $Server "head -n 1 $RemoteBase/zopf-dev/REVISION 2>/dev/null")".Trim()
    if ($devCurrent -ne $revision) {
        Write-Host "Hinweis: Auf Dev laeuft gerade $devCurrent, $revision war dort aber schon deployt." -ForegroundColor Yellow
    }
    Write-Host "Auf Dev deployt: $revision" -ForegroundColor Green
    return $null
}

if ($Environment -eq 'prod') {
    $problem = Test-ProdReady
    if ($problem) {
        if ($Force) {
            Write-Host "ACHTUNG -Force: $problem Deploy laeuft trotzdem." -ForegroundColor Yellow
            Send-DiscordNotification -title "Prod-Deploy mit -Force" -description "**Grund fuer die Sperre:** $problem`n**Stand:** $commit`n**Durch:** $DeployedBy" -color 15105570
        } else {
            Write-Host "`nProd-Deploy gestoppt: $problem" -ForegroundColor Red
            Write-Host "Erst pushen, die CI abwarten und auf Dev deployen. Nur im Notfall: .\deploy.ps1 prod -Force" -ForegroundColor Red
            exit 1
        }
    }
}

Step "1. Archiv erstellen"
# Database dumps, address downloads, local backups, the local branding folder and the deploy
# config (server address, webhook) never leave this machine. Dumps are told apart by their
# place: only those in the project root stay back, because the migrations under
# apps/backend/prisma/migrations are .sql files too and must go along.
$dumpExcludes = @(Get-ChildItem -File -Force | Where-Object { $_.Name -match '\.(sql|sql\.gz|dump|csv)$' } | ForEach-Object { "--exclude=$($_.Name)" })
# Windows' own tar (bsdtar): started from Git Bash, "tar.exe" would be GNU tar, which knows no --format=gnutar.
$Tar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path $Tar)) { $Tar = 'tar.exe' }
& $Tar --format=gnutar --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude="dist" --exclude="out" --exclude="backups" --exclude="./branding" --exclude=".env*" --exclude="deploy.config.ps1" @dumpExcludes --exclude=$ArchiveName --exclude=$RemoteScript -czf $ArchiveName .
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Archiv konnte nicht erstellt werden." }

# The part that runs on the server. Written with Unix line endings, otherwise
# bash stumbles over the carriage returns.
$backup = if ($SkipBackup) { 0 } else { 1 }
$remote = @"
#!/bin/bash
set -euo pipefail
cd "$RemoteDir"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

compose() { docker compose -f "$ComposeFile" -p "$ProjectName" "`$@"; }
services="$Services"
envval() { grep -E "^`$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/[[:space:]]*#.*`$//' | tr -d '\r"' || true; }

# Prerequisites (stop here before anything is touched): .env with the domain, the own proxy network
if [ ! -f .env ]; then
  echo "Die .env fehlt in $RemoteDir. Vorlage: .env.example (siehe docs/betrieb.md)"
  exit 1
fi
domain=`$(envval APP_DOMAIN)
if [ -z "`$domain" ]; then
  echo "APP_DOMAIN fehlt in der .env von $RemoteDir"
  exit 1
fi
echo "Adresse: https://`$domain"
proxy_network=`$(envval PROXY_NETWORK)
proxy_network=`${proxy_network:-$ProxyNetwork}
if ! docker network inspect "`$proxy_network" > /dev/null 2>&1; then
  echo "Docker-Netz `$proxy_network fehlt. Anlegen: docker network create `$proxy_network (und Traefik damit verbinden, siehe docs/betrieb.md)"
  exit 1
fi
mkdir -p branding

if [ "$backup" = "1" ]; then
  if docker ps --format '{{.Names}}' | grep -qx "$Prefix-db"; then
    mkdir -p backups
    file="backups/pre-deploy-`$(date +%Y%m%d-%H%M%S).sql.gz"
    docker exec "$Prefix-db" sh -c 'pg_dump -U "`$POSTGRES_USER" "`$POSTGRES_DB"' | gzip > "`$file"
    [ -s "`$file" ] || { echo "Backup ist leer"; exit 1; }
    echo "Backup: `$file (`$(du -h "`$file" | cut -f1))"
    ls -1t backups/pre-deploy-*.sql.gz | tail -n +11 | xargs -r rm --
    # Backups are kept at most a year (privacy notice, section 8).
    find backups -maxdepth 1 -name 'pre-deploy-*.sql.gz' -mtime +365 -delete
  else
    echo "Keine laufende Datenbank gefunden, kein Backup (erster Deploy?)"
  fi
else
  echo "Backup uebersprungen"
fi

rm -rf apps packages
tar --warning=no-unknown-keyword -xzf "$ArchiveName"
rm -f "$ArchiveName"

# Build while the running containers keep serving every request
echo "Docker Images werden gebaut (unterbruchsfrei im Hintergrund)..."
log=`$(mktemp)
if ! compose build `$services > "`$log" 2>&1; then
  tail -n 60 "`$log"; rm -f "`$log"
  echo "Build fehlgeschlagen. Die bisherigen Container laufen unveraendert weiter."
  exit 1
fi
rm -f "`$log"

# Keep every state under its git state as well (for going back without a rebuild)
for service in `$services; do
  docker tag "$ProjectName-`$service:latest" "$ProjectName-`$service:$revision"
done
echo "Images getaggt: $revision"

# The database only restarts when its configuration changed
compose up -d --no-build --wait db

# Migrations before the swap, in the new image: new code always finds its schema.
# So migrations must also work with the old code, which keeps running until the rollout.
# The label keeps the one-off container away from Traefik (run copies the service labels).
echo "Prisma Migrationen ausfuehren..."
if ! compose run --rm --no-deps -T --label traefik.enable=false backend sh ./db-migrate.sh; then
  echo "Migration fehlgeschlagen, neuer Code wurde nicht gestartet. Die bisherigen Container laufen weiter."
  exit 1
fi

# Swap the services one by one: the new container takes over once healthy, only then
# the old one goes. The frontend talks to the backend by container name, so the new
# container gets the fixed name back.
log=`$(mktemp)
if docker rollout --help > /dev/null 2>&1; then
  for service in `$services; do
    echo "Rollout `$service (unterbruchsfrei)..."
    if ! docker rollout -f "$ComposeFile" -p "$ProjectName" "`$service" > "`$log" 2>&1; then
      tail -n 60 "`$log"; rm -f "`$log"
      echo "Rollout von `$service fehlgeschlagen. `$service laeuft weiter auf dem alten Stand, bereits getauschte Dienste auf dem neuen."
      exit 1
    fi
    new_id=`$(compose ps -q "`$service")
    if [ -n "`$new_id" ]; then
      docker rename "`$new_id" "$Prefix-`$service" 2>/dev/null || true
    fi
  done
else
  echo "WARNUNG: docker rollout fehlt auf dem Server, Neustart per docker compose up -d (kurzer Unterbruch)"
  if ! compose up -d --no-build `$services > "`$log" 2>&1; then
    tail -n 60 "`$log"; rm -f "`$log"
    echo "Neustart fehlgeschlagen."
    exit 1
  fi
fi
rm -f "`$log"

# Running state (line 1 short hash/tag, line 2 full hash, line 3 time, line 4 kind)
{ echo "$revision"; echo "$revisionFull"; date -Iseconds; echo "deploy"; } > REVISION

# Keep the 7 last deployed states. The order is in .revisions (newest last), not in the
# image dates: unchanged services share an image, Docker's order is random there.
# Tags set by hand (e.g. rollback-*) do not match the pattern and stay.
{ grep -vxF "$revision" .revisions 2>/dev/null || true; echo "$revision"; } | tail -n 7 > .revisions.tmp
mv .revisions.tmp .revisions
for service in `$services; do
  docker images "$ProjectName-`$service" --format '{{.Tag}}' \
    | grep -E '^[0-9a-f]{7,40}(-dirty-[0-9]{14})?$' | grep -vxF -f .revisions \
    | xargs -r -I{} docker rmi "$ProjectName-`$service:{}" > /dev/null 2>&1 || true
done
docker image prune -f > /dev/null 2>&1 || true

check() {
  for i in `$(seq 1 30); do
    code=`$(curl -sL -o /dev/null -m 5 -w '%{http_code}' "`$1" || true)
    if [ "`$code" = "200" ]; then echo "OK   `$1"; return 0; fi
    sleep 3
  done
  echo "FEHLER `$1 antwortet nicht mit 200 (zuletzt `$code)"
  return 1
}

if ! check "https://`$domain/api/health" || ! check "https://`$domain/"; then
  echo "--- letzte Zeilen Backend ---"
  compose logs --tail 40 backend 2>&1 || true
  exit 1
fi

echo "DEPLOY_SUCCESS=1"
"@
[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))

Step "2. Hochladen"
ssh -n -o ConnectTimeout=30 -o ServerAliveInterval=15 $Server "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Keine Verbindung zum Server." }
# State running so far (for the list of changes)
$previousRevision = "$(ssh -n -o ConnectTimeout=30 $Server "head -n 1 $RemoteDir/REVISION 2>/dev/null")".Trim()
scp -q -B -o ConnectTimeout=30 $ArchiveName $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { Stop-Deploy "Das Hochladen hat nicht geklappt." }

# Changes since the state so far (only when it is a known commit)
$changes = @()
$previousCommit = $previousRevision -replace '-dirty-\d+$', ''
if ($previousCommit -match '^[0-9a-f]{7,40}$') {
    git cat-file -e "$previousCommit^{commit}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $changes = @(git log --format="%h %s" "$previousCommit..HEAD" 2>$null)
    }
}
$cleanRevision = $revision -replace '-dirty-\d+$', ''
$compareUrl = if ($RepoUrl -and $previousCommit -match '^[0-9a-f]{7,40}$' -and $previousCommit -ne $cleanRevision) {
    "$RepoUrl/compare/$previousCommit...$revisionFull"
} else { $null }

if ($Environment -eq 'prod') {
    # Announce beforehand, so nobody deploys at the same time
    $from = if ($previousCommit) { Get-CommitLink $previousCommit } else { "(unbekannt)" }
    $startInfo = "**Von** $from **auf** $(Get-CommitLink $cleanRevision)`n**Durch:** $DeployedBy $Dot $($changes.Count) Commit(s)"
    Send-DiscordNotification -title "$IconHourglass Deployment gestartet ($Environment)" -description $startInfo -color 3447003 -url $compareUrl
}

Step "3. Backup, Build, Migrationen und Neustart auf dem Server (dauert ein paar Minuten)"
# Show the output and keep it (for migrations, backup, warnings and failure details)
ssh -n -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=20 $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code" | Tee-Object -Variable remoteLines | Where-Object { $_ -notmatch '^DEPLOY_SUCCESS=' } | Out-Host
$result = $LASTEXITCODE
$script:RemoteOutput = @($remoteLines | ForEach-Object { "$_" })

Remove-Item $ArchiveName, $RemoteScript -ErrorAction SilentlyContinue

if ($result -ne 0) {
    $reason = $script:RemoteOutput | Where-Object { $_ -match 'fehlgeschlagen|FEHLER|fehlt' } | Select-Object -Last 1
    if (-not $reason) { $reason = "Das Skript auf dem Server ist mit Code $result abgebrochen." }
    Stop-Deploy $reason
}

$duration = [Math]::Round(((Get-Date) - $StartTime).TotalSeconds)
Write-Host "`nDeploy nach $Environment ist durch: API und Webseite antworten." -ForegroundColor Green
$siteLine = $script:RemoteOutput | Where-Object { $_ -match '^Adresse: ' } | Select-Object -First 1
$siteUrl = if ($siteLine) { $siteLine -replace '^Adresse: ', '' } else { $null }

$durationText = if ($duration -ge 60) { "{0} min {1} s" -f [Math]::Floor($duration / 60), ($duration % 60) } else { "$duration s" }
$deployInfo = "**Stand:** $(Get-CommitLink $cleanRevision) $($commit -replace '^[0-9a-f]+ ', '')"
if ($dirty.Count -gt 0) {
    $deployInfo += "`n**Achtung:** $($dirty.Count) nicht committete Datei(en) mitgeliefert (``$revision``)"
}
if ($siteUrl) { $deployInfo += "`n$siteUrl $Dot online" }

$fields = @()
if ($changes.Count -gt 0) {
    # Whole lines (at most 80 characters each) until the field is full; the rest as a number
    $list = ""
    $shownCount = 0
    foreach ($change in $changes) {
        $line = "- " + (Limit-Text $change 80)
        if (($list.Length + $line.Length + 40) -gt 1000) { break }
        $list += $(if ($list) { "`n" } else { "" }) + $line
        $shownCount++
    }
    if ($shownCount -lt $changes.Count) { $list += "`n... und $($changes.Count - $shownCount) weitere (Link oben)" }
    $fields += @{ name = "Neu seit $previousCommit ($($changes.Count))"; value = $list }
} elseif ($previousCommit -eq $cleanRevision) {
    $fields += @{ name = "Aenderungen"; value = "Gleicher Stand wie bisher (erneut deployt)" }
}
$migrations = @($script:RemoteOutput | ForEach-Object { if ($_ -match 'Applying migration `([^`]+)`') { "- ``$($Matches[1])``" } })
$fields += @{ name = "Migrationen"; value = $(if ($migrations.Count -gt 0) { $migrations -join "`n" } else { "keine" }); inline = $true }
$backupLine = $script:RemoteOutput | Where-Object { $_ -match '^Backup: ' } | Select-Object -First 1
$fields += @{ name = "Sicherung"; value = $(if ($backupLine) { "``$($backupLine -replace '^Backup: ', '')``" } else { "uebersprungen" }); inline = $true }
$fields += @{ name = "Dauer"; value = $durationText; inline = $true }
$fields += @{ name = "Durch"; value = $DeployedBy; inline = $true }
$warnings = @($script:RemoteOutput | Where-Object { $_ -match '^WARNUNG' })
if ($warnings.Count -gt 0) { $fields += @{ name = "Warnungen"; value = ($warnings -join "`n") } }
if ($previousCommit -match '^[0-9a-f]{7,40}$' -and $previousCommit -ne $cleanRevision) {
    $fields += @{ name = "Zurueck auf den alten Stand"; value = "``.\rollback.ps1 $Environment -Revision $previousRevision``" }
}

$color = if ($warnings.Count -gt 0) { 15105570 } else { 3066993 }
Send-DiscordNotification -title "$IconRocket Deployment erfolgreich ($Environment)" -description $deployInfo -color $color -fields $fields -url $compareUrl
