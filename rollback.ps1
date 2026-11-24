param (
    [ValidateSet('prod', 'dev')]
    [string]$Environment = 'dev',

    # Git state (image tag) to go back to, e.g. f1e674a or rollback-20261109
    [string]$Revision,

    # Only shows the running state and the available image tags
    [switch]$List,

    # Why it is rolled back (shown in the Discord message)
    [string]$Reason,

    # Also go back behind a migration that drops columns or tables (the old code then breaks!)
    [switch]$Force
)

# Puts backend and frontend back on an earlier state without a rebuild:
#   1. checks that an image with this tag exists on the server for every service
#   2. points latest back at these images
#   3. swaps the services one by one with docker rollout (like deploy.ps1)
#   4. writes REVISION and checks /health
#
# The database is NOT touched: migrations stay applied. That works as long as the old
# code runs with the newer schema (only added columns/tables). If something was removed
# or renamed, adjust the schema first (see docs/betrieb.md).

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ConfigFile = Join-Path $PSScriptRoot "deploy.config.ps1"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "deploy.config.ps1 fehlt: Vorlage deploy.config.example.ps1 kopieren und ausfuellen." -ForegroundColor Red
    exit 1
}
. $ConfigFile

$ProjectName = "zopf-$Environment"
$RemoteDir = "$RemoteBase/$ProjectName"
$RemoteScript = "rollback-remote.sh"
$Services = "backend frontend"
# No domains here: the address is APP_DOMAIN in the .env on the server.
if ($Environment -eq 'dev') {
    $ComposeFile = "docker-compose.staging.yml"
    $Prefix = "zopf-dev"
} else {
    $ComposeFile = "docker-compose.yml"
    $Prefix = "zopf"
}

if (-not $List -and -not $Revision) {
    Write-Host "Revision fehlt. Verfuegbare Staende anzeigen: .\rollback.ps1 $Environment -List" -ForegroundColor Red
    exit 1
}
if ($Revision -and $Revision -notmatch '^[A-Za-z0-9_.-]{1,128}$') {
    Write-Host "Ungueltiger Tag: $Revision" -ForegroundColor Red
    exit 1
}

$Dot = [char]0x00B7
$IconRewind = [char]::ConvertFromUtf32(0x23EA)
$IconCross = [char]::ConvertFromUtf32(0x274C)
$RepoUrl = (git -C $PSScriptRoot remote get-url origin 2>$null) -replace '\.git$', '' -replace '^git@github\.com:', 'https://github.com/'
$RolledBackBy = git -C $PSScriptRoot config user.name 2>$null
if (-not $RolledBackBy) { $RolledBackBy = $env:USERNAME }

# Discord message like deploy.ps1 (same webhook setting); failures never stop the rollback
function Send-DiscordNotification($title, $description, $color, $fields = @()) {
    $webhook = if ($DiscordWebhookUrl) { $DiscordWebhookUrl } else { $env:DISCORD_WEBHOOK_URL }
    if (-not $webhook) { return }
    $embed = @{
        title = $title
        description = $description
        color = $color
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        footer = @{ text = "Zopfaktion $Dot $Environment" }
    }
    $clean = @($fields | Where-Object { $_ -and $_.value } | ForEach-Object {
        $v = [string]$_.value; if ($v.Length -gt 1000) { $v = $v.Substring(0, 997) + "..." }
        @{ name = $_.name; value = $v; inline = [bool]$_.inline }
    })
    if ($clean.Count -gt 0) { $embed.fields = $clean }
    $payload = @{ username = "Zopfaktion Deploy"; embeds = @($embed) } | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Uri $webhook -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType "application/json; charset=utf-8" -UserAgent "ZopfaktionDeploy/1.0" -TimeoutSec 5 | Out-Null
    } catch { }
}

function Get-CommitLink($rev) {
    if ($RepoUrl -and $rev -match '^[0-9a-f]{7,40}$') { return "[``$rev``]($RepoUrl/commit/$rev)" }
    return "``$rev``"
}

# Migrations that drop columns or tables and are missing in the target state: the old code
# still asks for what was dropped (Prisma reads all columns) and breaks. Returns their names;
# empty = harmless, $null = not checkable.
function Get-DestructiveMigrationsAfter($rev) {
    $dir = 'apps/backend/prisma/migrations'
    git -C $PSScriptRoot cat-file -e "$rev^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }  # no git state (e.g. rollback tag)
    $found = @()
    foreach ($m in (Get-ChildItem (Join-Path $PSScriptRoot $dir) -Directory | Sort-Object Name)) {
        $sql = Join-Path $m.FullName 'migration.sql'
        if (-not (Test-Path $sql)) { continue }
        if (-not (Select-String -Path $sql -Pattern 'DROP\s+(COLUMN|TABLE)' -Quiet)) { continue }
        git -C $PSScriptRoot cat-file -e "${rev}:$dir/$($m.Name)/migration.sql" 2>$null
        if ($LASTEXITCODE -ne 0) { $found += $m.Name }
    }
    return ,$found
}

if (-not $List) {
    $destructive = Get-DestructiveMigrationsAfter ($Revision -replace '-dirty-\d+$', '')
    if ($null -eq $destructive) {
        Write-Host "Achtung: $Revision ist kein Git-Stand, ob er zum aktuellen Datenbankschema passt, laesst sich nicht pruefen." -ForegroundColor Yellow
    } elseif ($destructive.Count -gt 0) {
        $list = $destructive -join ', '
        if ($Force) {
            Write-Host "ACHTUNG -Force: $Revision kennt die geloeschten Spalten/Tabellen aus $list noch. Der alte Code wird Fehler werfen." -ForegroundColor Yellow
        } else {
            Write-Host "Rollback gestoppt: Nach $Revision kamen Migrationen, die Spalten oder Tabellen loeschen ($list)." -ForegroundColor Red
            Write-Host "Der alte Code fragt sie noch ab und wuerde bei jeder Anfrage scheitern. Nur mit -Force, wenn das Schema vorher zurueckgebaut ist." -ForegroundColor Red
            exit 1
        }
    }
}

$mode = if ($List) { "list" } else { "rollback" }
$remote = @"
#!/bin/bash
set -euo pipefail
cd "$RemoteDir"
compose() { docker compose -f "$ComposeFile" -p "$ProjectName" "`$@"; }
services="$Services"

echo "Laufender Stand ($Environment):"
if [ -f REVISION ]; then sed 's/^/  /' REVISION; else echo "  unbekannt (keine REVISION-Datei)"; fi

if [ "$mode" = "list" ]; then
  echo ""
  echo "Verfuegbare Staende (zuletzt deployt zuerst):"
  if [ -f .revisions ]; then
    tac .revisions | while read -r tag; do
      missing=""
      for service in `$services; do
        docker image inspect "$ProjectName-`$service:`$tag" > /dev/null 2>&1 || missing="`$missing `$service"
      done
      if [ -z "`$missing" ]; then echo "  `$tag"; else echo "  `$tag  (unvollstaendig, fehlt:`$missing)"; fi
    done
  else
    echo "  (noch keine .revisions, erst nach dem naechsten Deploy)"
  fi
  others=`$(docker images "$ProjectName-backend" --format '{{.Tag}}' | grep -vE '^(latest|[0-9a-f]{7,40}(-dirty-[0-9]{14})?)$' || true)
  if [ -n "`$others" ]; then
    echo "Von Hand gesetzte Tags:"
    echo "`$others" | sed 's/^/  /'
  fi
  exit 0
fi

for service in `$services; do
  if ! docker image inspect "$ProjectName-`$service:$Revision" > /dev/null 2>&1; then
    echo "Kein Image $ProjectName-`$service:$Revision vorhanden. Nichts wurde veraendert."
    exit 1
  fi
done

# First move all tags, then swap: so all services end up on the same state
for service in `$services; do
  docker tag "$ProjectName-`$service:$Revision" "$ProjectName-`$service:latest"
done

log=`$(mktemp)
if docker rollout --help > /dev/null 2>&1; then
  for service in `$services; do
    echo "Rollout `$service..."
    if ! docker rollout -f "$ComposeFile" -p "$ProjectName" "`$service" > "`$log" 2>&1; then
      tail -n 60 "`$log"; rm -f "`$log"
      echo "Rollout von `$service fehlgeschlagen. Bereits getauschte Dienste laufen auf $Revision."
      exit 1
    fi
    # The frontend talks to the backend by container name
    new_id=`$(compose ps -q "`$service")
    if [ -n "`$new_id" ]; then
      docker rename "`$new_id" "$Prefix-`$service" 2>/dev/null || true
    fi
  done
else
  echo "docker rollout fehlt, Neustart per docker compose up -d (kurzer Unterbruch)"
  if ! compose up -d --no-build `$services > "`$log" 2>&1; then
    tail -n 60 "`$log"; rm -f "`$log"
    echo "Neustart fehlgeschlagen."
    exit 1
  fi
fi
rm -f "`$log"

{ echo "$Revision"; echo "(Rollback)"; date -Iseconds; echo "rollback"; } > REVISION

envval() { grep -E "^`$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/[[:space:]]*#.*`$//' | tr -d '\r"' || true; }
domain=`$(envval APP_DOMAIN)
if [ -z "`$domain" ]; then echo "APP_DOMAIN fehlt in der .env"; exit 1; fi
echo "Adresse: https://`$domain"
check() {
  for i in `$(seq 1 30); do
    code=`$(curl -sL -o /dev/null -m 5 -w '%{http_code}' "`$1" || true)
    if [ "`$code" = "200" ]; then echo "OK   `$1"; return 0; fi
    sleep 3
  done
  echo "FEHLER `$1 antwortet nicht mit 200 (zuletzt `$code)"
  return 1
}
check "https://`$domain/api/health" && check "https://`$domain/" || exit 1
echo "ROLLBACK_SUCCESS=1"
"@

Set-Location $PSScriptRoot
[IO.File]::WriteAllText((Join-Path $PSScriptRoot $RemoteScript), ($remote -replace "`r`n", "`n"))
scp -q -B -o ConnectTimeout=30 $RemoteScript "${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) {
    Remove-Item $RemoteScript -ErrorAction SilentlyContinue
    Write-Host "Hochladen fehlgeschlagen." -ForegroundColor Red
    exit 1
}
$previousRevision = if ($List) { "" } else { "$(ssh -n -o ConnectTimeout=30 $Server "head -n 1 $RemoteDir/REVISION 2>/dev/null")".Trim() }
$startTime = Get-Date
ssh -n -o ConnectTimeout=30 -o ServerAliveInterval=15 $Server "bash $RemoteDir/$RemoteScript; code=`$?; rm -f $RemoteDir/$RemoteScript; exit `$code" | Tee-Object -Variable remoteLines | Where-Object { $_ -notmatch '^ROLLBACK_SUCCESS=' } | Out-Host
$result = $LASTEXITCODE
Remove-Item $RemoteScript -ErrorAction SilentlyContinue
if ($List) { exit $result }

$duration = [Math]::Round(((Get-Date) - $startTime).TotalSeconds)
$fields = @(
    @{ name = "Durch"; value = $RolledBackBy; inline = $true },
    @{ name = "Dauer"; value = "$duration s"; inline = $true },
    @{ name = "Grund"; value = $(if ($Reason) { $Reason } else { "nicht angegeben (-Reason)" }) },
    @{ name = "Datenbank"; value = "Unveraendert: Migrationen bleiben angewendet." }
)
$from = if ($previousRevision) { Get-CommitLink $previousRevision } else { "(unbekannt)" }
$siteLine = @($remoteLines | ForEach-Object { "$_" } | Where-Object { $_ -match '^Adresse: ' }) | Select-Object -First 1
$info = "**Von** $from **zurueck auf** $(Get-CommitLink $Revision)"
if ($siteLine) { $info += "`n$($siteLine -replace '^Adresse: ', '')" }

if ($result -ne 0) {
    Write-Host "`nROLLBACK FEHLGESCHLAGEN (siehe Ausgabe oben)." -ForegroundColor Red
    $tail = @($remoteLines | ForEach-Object { "$_" } | Where-Object { $_.Trim() } | Select-Object -Last 12) -join "`n"
    if ($tail) { $fields += @{ name = "Letzte Ausgabe"; value = "```````n$tail`n``````" } }
    Send-DiscordNotification -title "$IconCross Rollback fehlgeschlagen ($Environment)" -description $info -color 15158332 -fields $fields
    exit 1
}
Write-Host "`nRollback von $Environment auf $Revision abgeschlossen." -ForegroundColor Green
Send-DiscordNotification -title "$IconRewind Rollback ($Environment)" -description $info -color 15105570 -fields $fields
