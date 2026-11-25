import type { ReactNode } from 'react';
import { getBrand } from '@/lib/brand';
import { getI18n } from '@/lib/i18n';

/**
 * Privacy notice. Describes what this software does; whoever changes how data
 * is handled (new form, new service, other retention) updates this page in the
 * same change and sets LAST_UPDATED anew. Club details come from the environment.
 */
const LAST_UPDATED = '2026-11-25';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('privacy.title') };
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-xl font-bold">{children}</h2>;
}

export default async function PrivacyPage() {
  const brand = getBrand();
  const { locale, t } = await getI18n();
  const months = Number(process.env.PERSONAL_DATA_RETENTION_MONTHS) || 24;
  const hours = Number(process.env.ORDER_CONFIRM_HOURS) || 48;
  const contact = brand.contactEmail ? (
    <a className="underline" href={`mailto:${brand.contactEmail}`}>
      {brand.contactEmail}
    </a>
  ) : null;
  const who = [brand.orgName, brand.postalAddress].filter(Boolean).join(', ');

  if (locale === 'en') {
    return (
      <article className="max-w-2xl space-y-3 py-6 leading-relaxed">
        <h1 className="text-3xl font-bold">{t('privacy.title')}</h1>
        <p className="text-sm text-zinc-500">As of {LAST_UPDATED}</p>
        <H>Who is responsible</H>
        <p>
          {who}
          {contact && <> · {contact}</>}
        </p>
        <H>What we collect and why</H>
        <p>
          When you order we store your name, e-mail address, delivery address, optionally your phone number and a note, and what you ordered. We use this only to
          deliver your order, to send you the confirmation and, if you choose it, the invoice, and to answer your questions.
        </p>
        <p>If you tick the reminder box, we keep your e-mail address to write to you once before the next campaign. Every such e-mail lets you unsubscribe.</p>
        <H>Who sees your data</H>
        <p>
          The organising team of {brand.orgName}. The delivery teams see the name, address, phone number, note, the items and the amount to collect for the orders on
          their route; on delivery day this is also kept on their phones so the list works without reception, and removed there once the link has expired (two days after delivery) and the page is opened again. E-mails go through our mail provider. We do not pass your data on to anyone else and do not use it for advertising.
        </p>
        <p>
          Addresses come from the official building address directory of the Swiss Federal Office of Topography (swisstopo). If your address is missing there, we
          send that address once, without your name, to the search service of geo.admin.ch to find its location on the map.
        </p>
        <H>How long we keep it</H>
        <p>
          Unconfirmed orders are deleted after {hours} hours. Names, contact details and addresses of orders are removed {months} months after the delivery day;
          amounts and quantities remain for our accounts without reference to you.
        </p>
        <H>Cookies and tracking</H>
        <p>
          This site uses no tracking and no external fonts or scripts. It only stores the language you picked in a cookie; the team members' login uses a session
          cookie.
        </p>
        <H>Your rights</H>
        <p>
          You can ask what we store about you, have it corrected or deleted, and change or cancel your order until the deadline via the link in your e-mail. Write to
          us{contact && <> at {contact}</>}.
        </p>
      </article>
    );
  }

  return (
    <article className="max-w-2xl space-y-3 py-6 leading-relaxed">
      <h1 className="text-3xl font-bold">{t('privacy.title')}</h1>
      <p className="text-sm text-zinc-500">Stand {LAST_UPDATED}</p>
      <H>Verantwortlich</H>
      <p>
        {who}
        {contact && <> · {contact}</>}
      </p>
      <H>Was wir erheben und wozu</H>
      <p>
        Wenn du bestellst, speichern wir deinen Namen, deine E-Mail-Adresse, die Lieferadresse, freiwillig deine Telefonnummer und eine Bemerkung sowie was du bestellt
        hast. Wir verwenden das nur, um deine Bestellung zu liefern, dir die Bestätigung und gegebenenfalls die Rechnung zu schicken und deine Fragen zu beantworten.
      </p>
      <p>
        Kreuzt du die Erinnerung an, behalten wir deine E-Mail-Adresse, um dir vor der nächsten Aktion einmal zu schreiben. In jeder solchen Mail kannst du dich
        abmelden.
      </p>
      <H>Wer deine Daten sieht</H>
      <p>
        Das Organisationsteam des {brand.orgName}. Die Lieferteams sehen für die Bestellungen auf ihrer Route Name, Adresse, Telefonnummer, Bemerkung, die Produkte und
        den zu kassierenden Betrag; diese Angaben liegen am Liefertag auch auf ihren Handys, damit die Liste ohne Empfang funktioniert, und werden dort gelöscht, sobald der Link abgelaufen ist (zwei Tage nach dem Liefertag) und die Seite wieder geöffnet wird. E-Mails laufen über unseren Mail-Anbieter. Wir geben deine Daten sonst niemandem weiter und verwenden sie nicht für Werbung.
      </p>
      <p>
        Die Adressen stammen aus dem amtlichen Gebäudeadressverzeichnis des Bundesamts für Landestopografie (swisstopo). Fehlt deine Adresse dort, schicken wir diese
        Adresse einmal, ohne deinen Namen, an den Suchdienst von geo.admin.ch, um ihre Lage auf der Karte zu finden.
      </p>
      <H>Wie lange wir sie aufbewahren</H>
      <p>
        Unbestätigte Bestellungen werden nach {hours} Stunden gelöscht. Namen, Kontaktangaben und Adressen von Bestellungen entfernen wir {months} Monate nach dem
        Liefertag; Beträge und Stückzahlen bleiben für unsere Abrechnung ohne Bezug zu dir.
      </p>
      <H>Cookies und Tracking</H>
      <p>
        Diese Seite verwendet kein Tracking und lädt keine fremden Schriften oder Skripte. Sie speichert nur die gewählte Sprache in einem Cookie; das Login des Teams
        verwendet ein Sitzungs-Cookie.
      </p>
      <H>Deine Rechte</H>
      <p>
        Du kannst Auskunft verlangen, was wir über dich gespeichert haben, und es berichtigen oder löschen lassen. Deine Bestellung kannst du bis zum Bestellschluss
        über den Link in deiner E-Mail ändern oder stornieren. Schreib uns{contact && <> an {contact}</>}.
      </p>
    </article>
  );
}
