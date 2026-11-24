# Entwicklung

Zurück zur [README](../README.md).

## Lokal starten

Mit Docker (empfohlen):

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yml up --build
```

Ohne Docker für Web und API (Datenbank trotzdem per Docker):

```bash
npm install
docker compose -f docker-compose.dev.yml up -d db
npm run build --workspace=packages/shared
cd apps/backend && npx prisma migrate deploy && npm run dev   # API auf :4000
cd apps/web && npm run dev                                     # Web auf :3000, /api wird an :4000 weitergeleitet
```

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm test` | Tests (Vitest), ohne Datenbank |
| `npm run lint` | Biome |
| `npm run build` | Shared, Backend und Web bauen |
| `npm run db:migrate -- --name was_geaendert` | Migration für eine Schemaänderung erzeugen (braucht laufende DB) |

## Regeln

- **Öffentliches Repository.** Keine Domains, Server, Pfade, IBAN, Webhooks, Namen oder Adressen echter Personen in Code, Doku, Tests oder Seeds. Beispiele nur mit `example.ch` und erfundenen Daten. Die CI prüft zusätzlich mit gitleaks.
- **Nichts fest verdrahten, was ein Verein ändern will.** Name, Logo, Farben, Kontakt, Domain, Konto: aus der Umgebung (`packages/shared/src/branding.ts`, `apps/backend/src/lib/config.ts`). Inhalte einer Aktion: aus der Datenbank.
- **Zweisprachig.** Jeder sichtbare Text steht in `packages/shared/src/i18n/de.ts` und `en.ts` (der Typ erzwingt, dass beide dieselben Schlüssel haben).
- **Beträge in Rappen** (`Int`), nur die Anzeige rechnet in Franken.
- **Geheime Links** (Bestellung, Route) nur als Hash speichern (`apps/backend/src/lib/tokens.ts`).
- **Keine fremden Dienste im Browser** (Fonts, CDN, Tracking). Ausnahme mit Hinweis in der Datenschutzerklärung: Kartenkacheln.
- **Freitext an die API nur in benannten JSON-Feldern, nie HTML** (WAF, siehe [betrieb.md](betrieb.md#waf)).
- Schemaänderung immer mit Migration; die CI vergleicht Schema und Migrationen.
