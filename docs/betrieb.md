# Betrieb: Server, Domain, Branding, Deployment

Für die Person, die eine Installation betreut. Zurück zur [README](../README.md).

Dieses Dokument nennt bewusst keine Server, Domains oder Pfade einer echten Installation. Die stehen nur in der `.env` auf dem Server und in `deploy.config.ps1` (beide gitignored).

## Aufbau

- Ein Docker-Stack pro Umgebung: `db` (PostgreSQL), `backend` (API), `frontend` (Next.js).
- **Eine Domain** (`APP_DOMAIN`) für alles: Traefik schickt `https://<APP_DOMAIN>/api/…` an das Backend, alles andere an das Frontend. Dadurch braucht es kein CORS, und das Sitzungs-Cookie bleibt First-Party.
- Drei Netze pro Installation, wie im Cevi-Laden:

| Netz | Wer | Zweck |
| --- | --- | --- |
| `db` (intern) | Datenbank, Backend | Nur das Backend erreicht die Datenbank, kein veröffentlichter Port |
| `app` (intern) | Backend, Frontend | Frontend ruft das Backend unter `http://backend:4000` |
| `PROXY_NETWORK` | Backend, Frontend, Traefik | Einziger Weg herein und hinaus (Mail, später Geocoding) |

## Neue Installation

1. Auf dem Server das Proxy-Netz anlegen und Traefik daran anschliessen (nicht `--internal`, sonst kommt das Backend nicht an den Mailserver):
   ```bash
   docker network create zopf_prod_proxy   # bzw. zopf_dev_proxy
   ```
2. Ordner `<RemoteBase>/zopf-prod` (bzw. `zopf-dev`) anlegen, `.env.example` als `.env` hineinkopieren und ausfüllen. Für dev: `PROXY_NETWORK=zopf_dev_proxy` und `MAIL_ENV_LABEL=DEV`.
3. DNS-Eintrag für `APP_DOMAIN` auf den Server zeigen lassen.
4. Lokal `deploy.config.example.ps1` nach `deploy.config.ps1` kopieren und ausfüllen, dann `.\deploy.ps1 dev`.
5. Im Log des Backends steht beim ersten Start das Passwort für `admin` (oder es kommt aus `INITIAL_ADMIN_PASSWORD`): `docker compose -p zopf-dev logs backend`.

## Domain wechseln

`APP_DOMAIN` in der `.env` auf dem Server ändern, dann im Projektordner:

```bash
docker compose -f docker-compose.yml -p zopf-prod up -d
```

Traefik holt das Zertifikat selbst. Kein neuer Build nötig: Links in Mails, Traefik-Regeln und der Health-Check des Deploys lesen die Domain aus der `.env`. Soll die alte Adresse weiterleiten, braucht es dafür eine eigene Traefik-Regel (Redirect), z. B. in der dynamischen Konfiguration von Traefik.

## Branding

Alles zur Laufzeit, ohne neuen Build:

| Was | Wo |
| --- | --- |
| Vereinsname, Name der Aktion | `ORG_NAME`, `APP_NAME` |
| Farben | `BRAND_COLOR_PRIMARY`, `BRAND_COLOR_SECONDARY` (Hex). Die Textfarbe darauf (schwarz/weiss) wählt die App nach Kontrast |
| Logo | Ordner `branding/` neben der Compose-Datei: `logo.svg` (Webseite), `logo.png` (PDFs), optional `favicon.ico`. Wird read-only in beide Container gemountet. Fehlt eine Datei, gilt das Cevi-Logo |
| Kontakt, Impressum, Postadresse | `CONTACT_EMAIL`, `LEGAL_IMPRINT_URL`, `LEGAL_POSTAL_ADDRESS` |

Nach einer Änderung an der `.env`: `docker compose … up -d` (startet die Container mit den neuen Werten). Nach einer Änderung am Logo reicht ein Neuladen (Cache 1 Stunde).

## Deploy mit `deploy.ps1`

Übernommen aus dem Cevi-Laden, nur ohne fest eingetragene Domains:

- `.\deploy.ps1` (dev, Standard) bzw. `.\deploy.ps1 prod`. Optionen: `-SkipBackup`, `-Force` (nur im Notfall).
- Ablauf: Archiv packen (ohne `.env`, Dumps, CSV, `branding/`, `deploy.config.ps1`), prüfen, dass auf dem Server `.env` mit `APP_DOMAIN` und das Proxy-Netz da sind, DB-Dump, Images bauen (alte Container laufen weiter), Migrationen im neuen Image, Backend und Frontend einzeln per `docker rollout` tauschen, dann `https://<APP_DOMAIN>/api/health` und `https://<APP_DOMAIN>/` prüfen.
- **Prod nur mit geprüftem Stand:** alles committet, auf `master`, gepusht, CI für genau diesen Commit grün (`gh` angemeldet) und derselbe Stand vorher auf dev deployt.
- Images bekommen den Git-Stand als Tag; auf dem Server steht der laufende Stand in `REVISION`, die letzten 7 in `.revisions`.
- **Zurücksetzen:** `.\rollback.ps1 dev -List`, `.\rollback.ps1 prod -Revision <tag> -Reason "…"`. Die Datenbank bleibt, wie sie ist; Migrationen mit `DROP COLUMN/TABLE` nach dem Ziel-Stand stoppen den Rollback.
- Discord-Meldungen, wenn in `deploy.config.ps1` ein Webhook steht. Die Serveradresse steht nie in den Meldungen.

## Adressverzeichnis

Im Admin bei der Aktion: «Adressen importieren». Das Backend lädt das amtliche Gebäudeadressverzeichnis von swisstopo (CSV-ZIP, ca. 150 MB, täglich aktualisiert, Open Government Data mit Quellenangabe «© swisstopo»), behält nur die Adressen mit Status «real» in den Postleitzahlen der Aktion und rechnet die Koordinaten von LV95 in WGS84 um. Dauer etwa eine halbe Minute. Danach fragt die Adresssuche beim Bestellen niemanden mehr ausser der eigenen Datenbank.

- Der Download läuft aus dem Backend-Container über das Proxy-Netz; die Datei liegt nur während des Imports in `/tmp` des Containers.
- `ADDRESS_DIRECTORY_URL` zeigt bei Bedarf auf einen eigenen Spiegel, `ADDRESS_DIRECTORY_FILE` auf ein ZIP im Container (ohne Download).
- Für Adressen, die im Verzeichnis fehlen, fragt das Backend beim Bestellen einmal den SearchServer von geo.admin.ch (nur die Adresse, nie Name oder E-Mail). Findet er nichts, setzt das OK den Pin von Hand.

## Mails

Versand über SMTP (`SMTP_*`, wie im Cevi-Laden). Was der Server nicht annimmt, wartet im Postausgang (`outbox_mails`) und wird nach 5 und 15 Minuten, 1, 4 und 12 Stunden erneut versucht; nach 14 Tagen räumt die Aufbewahrung auf. Ohne `SMTP_HOST` schreibt eine Test- oder lokale Installation (`MAIL_ENV_LABEL` gesetzt) die Mails samt Links ins Backend-Log, die Produktion warnt nur.

## Logs

`docker compose -p zopf-prod logs -f backend`. Die Zeilen enthalten keine IP-Adressen, Header, Cookies oder Query-Strings, weil Links Geheimnisse tragen (Bestellung, Route).

## Grenzen

Das Backend läuft als ein Container. Die Sperre nach Fehlanmeldungen liegt im Arbeitsspeicher; ein Neustart hebt sie auf. Für eine Zopfaktion ist ein Container richtig.

## WAF

Steht eine WAF (z. B. CrowdSec AppSec mit OWASP CRS) vor dem Server, kann sie Freitext blockieren. Freitext geht nur in benannten JSON-Feldern, nie als HTML; Markdown rendert das Backend.

| Pfad | Feld | Wofür |
| --- | --- | --- |
| `POST`/`PUT /api/v1/public/orders…` | `customerName`, `address.street`, `address.houseNumber`, `address.city`, `phone`, `notes` | Bestellformular, persönliche Bestellseite |
| `GET /api/v1/public/addresses` | `q` | Adresssuche |
| `/api/v1/admin/*` | `infoDe`, `infoEn`, `purposeDe`, `purposeEn`, Produktnamen und -beschreibungen | Texte der Aktion (Markdown) |

Für eine CrowdSec-AppSec-Installation mit OWASP CRS reicht pro öffentlichem Pfad eine Regel, die nur diese Felder von den Regelgruppen 932/941/942 ausnimmt (am Pfad festgemacht, nicht an der Domain, so übersteht sie einen Domainwechsel). Alle anderen Felder, z. B. `email`, prüft die WAF weiter.

Alle Admin-Pfade liegen unter `/api/v1/admin/`, so dass eine WAF sie mit einer einzigen Regel von den Textfiltern ausnehmen kann (sie sind ohnehin nur mit Admin-Sitzung nutzbar).
