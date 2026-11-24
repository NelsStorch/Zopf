# Konzept: Zopfaktion

Bestell- und Lieferplattform für eine Zopfbackaktion eines Vereins (Standard: Cevi-Branding). Eine Instanz pro Verein, alles Vereinsspezifische kommt aus der Umgebung (`.env`) oder aus der Datenbank, nie aus dem Code. Das Repository ist öffentlich (AGPL-3.0).

Zurück zur [README](../README.md).

## Grundsätze

| Grundsatz | Umsetzung |
| --- | --- |
| Öffentliches Repo | Keine Domains, Serveradressen, IBAN, Webhooks, Personen- oder Kundendaten im Code, in Doku, Seeds oder Tests. Alles über `.env` (gitignored) bzw. `deploy.config.ps1` (gitignored). Vorlagen: `.env.*.example`, `deploy.config.example.ps1`. |
| Eine Instanz pro Verein | Kein Multi-Tenant. Ein Verein = ein Docker-Stack mit eigener Datenbank. |
| Branding per env | Name, Logo, Farben, Kontakt, Impressum und Zahlungskonto über Umgebungsvariablen. Standard: Cevi (Blau `#003d8f`, Rot `#e20031`, Cevi-Logo). Wird zur Laufzeit gelesen: ein Image für alle Vereine. |
| Eine Domain | Web und API laufen unter derselben Adresse (`https://<APP_DOMAIN>/` bzw. `/api`). Traefik verteilt nach Pfad. Kein CORS, Cookies bleiben First-Party. Domainwechsel = `.env` ändern, neu starten. |
| Sprachen | Deutsch und Englisch ab dem ersten Tag (Oberfläche, Mails, PDFs). Inhalte pro Aktion (Infotext, Produktnamen) zweisprachig in der DB. |
| Keine fremden Dienste im Browser | Keine Google Fonts, kein CDN, kein Tracking. Ausnahme: Kartenkacheln von swisstopo (in der Datenschutzerklärung genannt). |
| WAF | Freitext nur in klar benannten JSON-Feldern, nie rohes HTML. HTML für Mails und Infoseite rendert das Backend. |

## Technik

| Teil | Technik | Ordner |
| --- | --- | --- |
| Web (Bestellseite, Lieferansicht, Admin) | Next.js 16, React 19, Tailwind CSS 4, PWA für die Lieferansicht | `apps/web` |
| API | Fastify 5, Prisma 7, Zod 4 | `apps/backend` |
| Gemeinsam | Schemas, Typen, Übersetzungen, Branding-Standard | `packages/shared` |
| Datenbank | PostgreSQL 17 | Docker |
| PDF | `pdfkit` + `swissqrbill` (QR-Rechnung), `qrcode` (QR auf dem Routenblatt) | Backend |
| Mail | `nodemailer` (SMTP) mit Postausgang und Wiederholungen, optional IMAP wie im Cevi-Laden | Backend |
| Karte | Leaflet + Kacheln von swisstopo (WMTS) | Web |
| Adressen | Amtliches Gebäudeadressverzeichnis (swisstopo, Open Data), lokal in der DB | Backend |

Betrieb wie beim Cevi-Laden: Docker hinter Traefik, dev/prod getrennt, `deploy.ps1`/`rollback.ps1`, CI auf GitHub Actions. Siehe [betrieb.md](betrieb.md).

## Rollen

| Rolle | Zugang | Kann |
| --- | --- | --- |
| Kundschaft | Kein Konto. Persönlicher Link per Mail. | Bestellen, Bestellung per Mail bestätigen, bis Bestellschluss ansehen/ändern/stornieren, Rechnung herunterladen, Erinnerung fürs nächste Jahr abonnieren. |
| Lieferteam | Geheimer Link pro Route (auch als QR auf dem Routenblatt). Kein Login. | Nur die eigene Route sehen (Liste und Karte), abhaken: geliefert, nicht angetroffen, bezahlt (bar/TWINT), Notiz. Funktioniert offline. |
| Admin (OK) | Benutzername + Passwort. Keine Abstufungen. | Alles: Aktionen, Produkte, Bestellungen, Zahlungen, Routen, Mails, Benutzer, Export. |

Admin-Login wie im Cevi-Laden: bcrypt, Sitzung im httpOnly-Cookie (JWT mit `tokenVersion`), Sperre nach Fehlversuchen, beim ersten Start wird ein Admin angelegt (Passwort aus `INITIAL_ADMIN_PASSWORD` oder einmal im Log), Passwortwechsel beim ersten Login erzwungen.

## Abläufe

### 1. Aktion vorbereiten (Admin)

- Neue **Aktion** (Kampagne) anlegen oder die letzte kopieren (übernimmt Produkte, Grössen, Preise, Texte, Liefergebiet).
- Felder: Name, Liefertag, ungefähre Lieferzeit als Text («ab 7 Uhr»), Bestellschluss, Infotext und Zweck der Sammlung (DE/EN, Markdown, im Backend gerendert), Zahlungsfrist der Rechnung.
- **Produkte** mit beliebig vielen **Grössen**, je mit Preis. Reihenfolge per Drag-and-Drop.
- **Liefergebiet**: Liste von PLZ. Daraus wird das Adressverzeichnis importiert (siehe unten).
- Status: Entwurf → Offen → Geschlossen → Archiviert. Nur genau eine Aktion ist «offen».

### 2. Bestellen (Kundschaft)

1. Startseite zeigt Infos zur Aktion: wann geliefert wird, ungefähre Zeit, wofür gesammelt wird, Bestellschluss.
2. Produkte und Grössen wählen, Menge.
3. **Adresse**: Suchfeld mit Vorschlägen aus dem lokalen Adressverzeichnis (Strasse + Nummer, nur im Liefergebiet). Daneben **«Meine Adresse fehlt»**: freie Eingabe, die Bestellung wird als «Adresse prüfen» markiert. So wird niemand wegen eines Fehlers im Datensatz ausgeschlossen.
4. Name, E-Mail, Telefon (optional), Bemerkung für das Lieferteam.
5. **Zahlungsart**: QR-Rechnung per E-Mail (vorausgewählt, oben, empfohlen) oder Bar/TWINT bei der Übergabe.
6. Nicht vorangekreuzt: «Vor der nächsten Aktion einmal per E-Mail erinnern».
7. Pflicht: Hinweis auf die Datenschutzerklärung, Bestätigung «mind. 16 oder Eltern einverstanden» (wie im Cevi-Laden).
8. Antispam: Altcha (Proof-of-Work, ohne Drittanbieter) + Rate-Limit.

Danach: Mail mit **Bestätigungslink**. Erst der Klick macht die Bestellung gültig (`PENDING_CONFIRMATION` → `CONFIRMED`). Unbestätigte verfallen nach 48 h (`ORDER_CONFIRM_HOURS`). Nach der Bestätigung kommt die Bestellbestätigung, bei QR-Rechnung mit dem PDF im Anhang.

**Persönlicher Link** (`/bestellung/<token>`): Bestellung ansehen, bis Bestellschluss ändern oder stornieren, Rechnung herunterladen. Der Token steht nur gehasht in der DB; «Link erneut senden» erzeugt einen neuen. Jede Änderung erzeugt eine neue Rechnung (gleiche Nummer, neuer Betrag) und eine Mail.

### 3. Zahlung

- **QR-Rechnung**: wie im Cevi-Laden (`pdfkit` + `swissqrbill`, Konto aus `PAYMENT_*`). Mitteilung enthält die Bestellnummer (`ZOPF-2027-0142`). Ohne vollständiges Konto in der env gibt es keine QR-Rechnung, die Option wird ausgeblendet.
- **Bar/TWINT bei Übergabe**: In der Lieferansicht steht «Kassieren: CHF 24.00». Statischer TWINT-QR aus `TWINT_QR_PAYLOAD` auf dem Routenblatt und in der App.
- **Bezahlt markieren**: von Hand im Admin (Liste mit Suche nach Nummer/Name/Betrag, Mehrfachauswahl) oder durch das Lieferteam (bar/TWINT). Kein automatischer Bankabgleich in der ersten Version (später möglich: camt.054).
- **Zahlungserinnerung**: von Hand auslösbar, einzeln oder für alle offenen QR-Rechnungen, mit Vorschau und Testmail. Jede versendete Erinnerung wird pro Bestellung protokolliert.
- **Ab Liefertag**: Offene QR-Rechnungen erscheinen in der Route wie Barzahlende, «offen, bitte kassieren».

### 4. Backstube

- Übersicht der Stückzahlen pro Produkt und Grösse über alle bestätigten Bestellungen, live.
- Zusätzlich pro Route (zum Bereitstellen der Kisten).
- Druckbare Liste (PDF).

### 5. Tourenplanung

Das OK gibt die Anzahl Routen ein. Zwei Verfahren, wählbar:

| Verfahren | Braucht | Ergebnis |
| --- | --- | --- |
| **Standard** | nichts | Ausgeglichenes k-Means nach Luftlinie (Routen etwa gleich viele *Zöpfe*, nicht nur Stopps). Innerhalb der Route Reihenfolge per Nearest-Neighbour + 2-opt. Gut für Dorf/Quartier, zu Fuss oder mit dem Velo. |
| **Mit Strassennetz** | `OSRM_URL` gesetzt (eigener OSRM-Container, CH-Extrakt) | Wie oben, Reihenfolge mit echten Fuss-/Velo-/Autodistanzen. Ohne die Variable ist die Option ausgeblendet. |

Startpunkt (Backstube) als Koordinate pro Aktion. Danach von Hand: Stopps per Klick auf der Karte einer anderen Route zuweisen, Reihenfolge per Drag-and-Drop, Routen umbenennen, Farbe, Leitende als Text. Bestellungen ohne Koordinate («Adresse prüfen») werden zuerst angezeigt; das OK setzt den Pin von Hand.

**Routenblatt (PDF, A4)**: Name, Farbe, Leitende, Anzahl Stopps und Zöpfe, Summe zu kassieren, **QR-Code mit dem geheimen Link** (im Branding, Technik aus schichtplan_v2: Fehlerkorrektur H, Logo in der Mitte), TWINT-QR, Ladeliste (Stück pro Produkt/Grösse), Stoppliste in Reihenfolge mit Adresse, Name, Telefon, Bemerkung, Produkten, Betrag und Kästchen zum Abhaken (Papier als Rückfallebene).

**Gruppen-Dashboard**: pro Route live Stopps, Zöpfe, davon geliefert, offene Beträge, kassiert, letzte Aktivität.

### 6. Liefern (Lieferteam)

- Link öffnet `/route/<token>` (PWA, auf dem Startbildschirm installierbar). Token nur gehasht in der DB, vom OK jederzeit neu erzeugbar (alter Link wird ungültig). Gültigkeit: ab Freigabe durch das OK bis 2 Tage nach dem Liefertag.
- Liste in Reihenfolge und Karte, «Navigation öffnen» (Link auf die Karten-App des Handys, keine eingebettete fremde Karte).
- Pro Stopp: Geliefert · Nicht angetroffen · Bezahlt (bar/TWINT) · Notiz. Grosser Hinweis «Kassieren CHF …» wenn offen.
- **Offline**: Service Worker cacht App und Routendaten. Häkchen gehen in eine Warteschlange (IndexedDB) und werden synchronisiert, sobald Netz da ist. Anzeige «3 Änderungen noch nicht gesendet». Jede Änderung trägt eine Client-ID und einen Zeitstempel; der Server ist idempotent und protokolliert alles (`delivery_events`). Konflikt (zwei Handys, gleiches Feld): spätere Änderung gewinnt, beide stehen im Protokoll.

### 7. Nach der Aktion

- Abschluss-Übersicht: Einnahmen nach Zahlungsart, offene Beträge, Stückzahlen, Export CSV/Excel.
- Aktion archivieren.
- **Erinnerung im Folgejahr**: Double-Opt-in (Klick in der Bestätigungsmail). Vor der nächsten Aktion: Knopf «Erinnerung senden» an alle bestätigten Kontakte, mit Vorschau, Testmail, Abmeldelink und Postadresse des Vereins in jeder Mail. Versand im Hintergrund mit SMTP-Pacing (wie Rundmail im Cevi-Laden).

## Adressen und Geocoding

1. **Adressverzeichnis**: Das amtliche Gebäudeadressverzeichnis von swisstopo (Open Data, CSV mit Koordinaten) wird im Admin für die PLZ des Liefergebiets importiert (Tabelle `addresses`). Die Suche beim Bestellen läuft nur gegen die eigene DB: kein Rate-Limit, keine Anfrage an Dritte, Koordinaten gleich dabei.
2. **«Adresse fehlt»**: Das Backend versucht einmal den SearchServer von geo.admin.ch (gratis, Fair Use; Ergebnis wird gespeichert, also höchstens eine Anfrage pro Bestellung). Findet er nichts, setzt das OK den Pin von Hand.
3. **Karte**: Kacheln von swisstopo (WMTS), Attribution sichtbar.

## Datenschutz und Aufbewahrung

- Datenschutzerklärung als eigene Seite (`/datenschutz`), Texte DE/EN, Verein und Postadresse aus der env.
- Personendaten von Bestellungen (Name, E-Mail, Telefon, Adresse, Bemerkung) werden **2 Jahre nach dem Liefertag** anonymisiert (`PERSONAL_DATA_RETENTION_MONTHS=24`). Beträge, Nummern, Mengen und PLZ bleiben für die Statistik. Hinweis: Falls Rechnungen als Buchungsbelege gelten, verlangt Art. 958f OR 10 Jahre; der Wert ist deshalb einstellbar.
- Erinnerungs-Kontakte (nur E-Mail und Sprache) bleiben bis zur Abmeldung.
- Unbestätigte Bestellungen werden nach Ablauf gelöscht. Postausgang nach 14 Tagen.
- IP-Adressen: nicht in Logs (wie im Cevi-Laden), im Protokoll nach 90 Tagen gelöscht.

## Datenmodell

Beträge in Rappen (`Int`). Übersicht, die Wahrheit steht in `apps/backend/prisma/schema.prisma`.

| Tabelle | Inhalt |
| --- | --- |
| `users` | Admins: Benutzername, Passwort-Hash, aktiv, Passwortwechsel nötig, `tokenVersion` |
| `campaigns` | Aktion: Slug, Name, Status, Liefertag, Lieferzeit-Text, Bestellschluss, Info/Zweck DE/EN, Zahlungsfrist, Startpunkt, PLZ-Liste, nächste Bestellnummer |
| `products`, `product_sizes` | Produkte (Name/Beschreibung DE/EN) mit Grössen (Bezeichnung DE/EN, Preis) |
| `addresses` | Importiertes Adressverzeichnis: Strasse, Nummer, PLZ, Ort, Koordinaten |
| `orders` | Bestellung: Nummer, Status, Kontakt, Adresse + Koordinate + Herkunft, Bemerkung, Zahlungsart/-status, Lieferstatus, Route + Reihenfolge, Opt-in, Sprache, Total, Token-Hashes |
| `order_items` | Positionen mit Namen und Preis zum Zeitpunkt der Bestellung |
| `routes` | Route: Name, Farbe, Leitende, Reihenfolge, Token-Hash, Freigabe |
| `delivery_events` | Protokoll jeder Änderung aus der Lieferansicht (idempotent per Client-ID) |
| `reminder_contacts` | Opt-in für das Folgejahr: E-Mail, Sprache, bestätigt, Abmelde-Token |
| `order_mail_logs` | Welche Mail wann an welche Bestellung ging (Bestätigung, Rechnung, Erinnerung) |
| `outbox_mails` | Postausgang mit Wiederholungen |
| `audit_logs` | Wer hat was gemacht (Admin oder Route) |

## Konfiguration (Auszug)

| Variable | Zweck |
| --- | --- |
| `APP_DOMAIN` | Domain der Instanz, z. B. `zopf.example.ch`. Daraus: Traefik-Regeln, Links in Mails, Health-Check beim Deploy |
| `ORG_NAME`, `APP_NAME` | Vereinsname, Name der Aktion (Standard: «Cevi», «Zopfaktion») |
| `BRAND_COLOR_PRIMARY`, `BRAND_COLOR_SECONDARY` | Farben (Standard Cevi-Blau/-Rot) |
| `BRANDING_DIR` | Ordner mit `logo.svg`/`logo.png`/`favicon.ico` (Volume). Fehlt eine Datei, gilt der Standard |
| `CONTACT_EMAIL`, `LEGAL_IMPRINT_URL`, `LEGAL_POSTAL_ADDRESS` | Kontakt, Impressum, Postadresse |
| `PAYMENT_IBAN`, `PAYMENT_CREDITOR_*`, `PAYMENT_MESSAGE`, `TWINT_QR_PAYLOAD` | Konto und TWINT |
| `SMTP_*`, `IMAP_*`, `MAIL_ENV_LABEL` | Mailversand wie im Cevi-Laden |
| `OSRM_URL` | Optional: Routing mit Strassennetz |
| `PERSONAL_DATA_RETENTION_MONTHS` | Aufbewahrung (Standard 24) |

Alle Variablen mit Erklärung: `.env.example`.

## Umsetzungsreihenfolge

1. **Gerüst**: Monorepo, Docker dev/prod, Deploy, CI, Branding, i18n, Prisma-Schema, Admin-Login. ✅
2. **Aktion und Produkte** im Admin, öffentliche Infoseite.
3. **Adressverzeichnis**: Import, Suche, «Adresse fehlt».
4. **Bestellen**: Formular, Bestätigung per Mail, persönlicher Link, Postausgang.
5. **QR-Rechnung** und Zahlungen im Admin, Erinnerungen.
6. **Backstube** und Exporte.
7. **Tourenplanung**: Clustering, Karte, manuelle Anpassung, Routenblatt.
8. **Lieferansicht** mit Offline-Sync.
9. **Erinnerung im Folgejahr**, Aufbewahrung, Datenschutzseite.
10. Optional: OSRM, camt.054-Abgleich.
