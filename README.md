# Zopfaktion 🥖

Bestell- und Lieferplattform für die Zopfbackaktion eines Vereins: Bestellen ohne Konto, QR-Rechnung, Backstuben-Übersicht, Tourenplanung auf der Karte und eine offline-fähige Lieferansicht fürs Handy.

Standardmässig im Cevi-Look. Name, Logo, Farben, Kontakt, Domain und Bankkonto kommen aus der Umgebung, so dass jeder Verein seine eigene Instanz betreiben kann.

> **Stand:** im Aufbau. Fertig sind Gerüst, Branding, Sprachen (DE/EN), Admin-Login und Deployment. Was als Nächstes kommt, steht in [docs/konzept.md](docs/konzept.md#umsetzungsreihenfolge).

| Teil | Technik | Ordner |
| --- | --- | --- |
| Web (Bestellseite, Lieferansicht, Verwaltung) | Next.js 16, React 19, Tailwind CSS 4 | `apps/web` |
| API | Fastify 5, Prisma 7, Zod 4 | `apps/backend` |
| Gemeinsam | Branding, Übersetzungen, Schemas | `packages/shared` |
| Datenbank | PostgreSQL 17 | Docker |

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [docs/konzept.md](docs/konzept.md) | Was die Plattform kann, Rollen, Abläufe, Datenmodell, Reihenfolge der Umsetzung |
| [docs/betrieb.md](docs/betrieb.md) | Server, Domain, Branding, Deployment, Rollback |
| [docs/entwicklung.md](docs/entwicklung.md) | Lokal starten, Tests, Migrationen, Regeln für Beiträge |

## Schnellstart (lokal)

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yml up --build
```

- Webseite: <http://localhost:3000>, Verwaltung unter <http://localhost:3000/admin>
- Erstes Konto: `admin`, Passwort aus `INITIAL_ADMIN_PASSWORD` (muss beim ersten Login geändert werden)

## Eigener Verein

1. `.env.example` nach `.env` kopieren, `APP_DOMAIN`, `ORG_NAME`, Farben, Kontakt und Bankkonto eintragen.
2. Eigenes Logo als `branding/logo.svg` (Webseite) und `branding/logo.png` (PDFs) neben `docker-compose.yml` legen.
3. `docker compose up -d --build` hinter Traefik. Einzelheiten: [docs/betrieb.md](docs/betrieb.md).

## Lizenz

[GNU Affero General Public License v3.0 oder neuer](https://www.gnu.org/licenses/agpl-3.0.html) (`AGPL-3.0-or-later`). Wer eine geänderte Version als Dienst betreibt, muss den Quellcode der Änderungen zugänglich machen.

Das Cevi-Logo ist das Zeichen des Cevi Schweiz und gehört nicht zur Lizenz des Codes. Vereine ausserhalb des Cevi ersetzen es durch ihr eigenes (siehe oben).
