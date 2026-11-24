# Zopfaktion: Hinweise für Agenten

- Konzept und Reihenfolge: `docs/konzept.md`. Betrieb: `docs/betrieb.md`. Regeln: `docs/entwicklung.md` (Abschnitt «Regeln») gelten vollständig.
- **Öffentliches Repo:** niemals Domains, Serveradressen/-pfade, IBAN, Webhooks, echte Namen oder Kundendaten committen. Alles Installationsspezifische über `.env` (Vorlage `.env.example`, jede neue Variable dort dokumentieren und in allen drei Compose-Dateien durchreichen).
- Branding (Name, Logo, Farben) nie hart codieren; Standard ist Cevi, siehe `packages/shared/src/branding.ts`.
- Jeder sichtbare Text in DE und EN (`packages/shared/src/i18n/`).
- Vorlagen für Muster: `../laden_v2` (QR-Rechnung, Postausgang, Deploy), `../schichtplan_v2` (gebrandeter QR-Code). Code von dort generalisieren, nicht mit Cevi-/Server-Spezifika übernehmen.
- Neue Funktionen in `docs/konzept.md` (Umsetzungsreihenfolge) abhaken.
