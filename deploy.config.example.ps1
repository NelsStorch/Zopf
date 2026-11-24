# Vorlage fuer deploy.config.ps1 (gitignored): Serveradresse und Webhook gehoeren nicht ins Repo.
#   Copy-Item deploy.config.example.ps1 deploy.config.ps1
$Server = "root@<server-ip>"
# Auf dem Server liegen die Installationen unter $RemoteBase/zopf-prod und $RemoteBase/zopf-dev,
# jede mit ihrer eigenen .env (Domain usw., Vorlage .env.example).
$RemoteBase = "/home/<benutzer>/projects"
# Optional: Discord-Webhook fuer Deploy-Meldungen (sonst Umgebungsvariable DISCORD_WEBHOOK_URL)
$DiscordWebhookUrl = ""
