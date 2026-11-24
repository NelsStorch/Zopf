/** German texts. The keys are the source of truth; en.ts must have the same ones (checked by the type). */
export const de = {
  'lang.name': 'Deutsch',
  'lang.switch': 'English',

  'common.loading': 'Wird geladen…',
  'common.save': 'Speichern',
  'common.cancel': 'Abbrechen',
  'common.error': 'Etwas ist schiefgelaufen. Bitte versuche es nochmals.',
  'common.chf': 'CHF {amount}',

  'footer.contact': 'Kontakt',
  'footer.imprint': 'Impressum',
  'footer.privacy': 'Datenschutz',
  'footer.admin': 'Für das OK',

  'home.noCampaign.title': 'Zurzeit keine Aktion',
  'home.noCampaign.text': 'Die nächste {appName} ist noch nicht offen. Schau bald wieder vorbei!',
  'home.delivery': 'Wir bringen die Zöpfe am {date} vorbei',
  'home.deliveryTime': 'Ungefähr: {time}',
  'home.deadline': 'Bestellen bis {date}',
  'home.closed': 'Die Bestellungen sind geschlossen.',
  'home.purpose': 'Wofür wir sammeln',
  'home.order': 'Jetzt bestellen',
  'home.orderSoon': 'Das Bestellformular folgt in Kürze.',

  'admin.title': 'Verwaltung',
  'admin.login.title': 'Anmelden',
  'admin.login.username': 'Benutzername',
  'admin.login.password': 'Passwort',
  'admin.login.remember': 'Angemeldet bleiben (30 Tage)',
  'admin.login.submit': 'Anmelden',
  'admin.login.failed': 'Benutzername oder Passwort ist falsch.',
  'admin.login.locked': 'Zu viele Fehlversuche. Bitte später erneut versuchen.',
  'admin.logout': 'Abmelden',
  'admin.welcome': 'Hallo {name}',
  'admin.dashboard.empty': 'Hier entstehen Aktionen, Bestellungen, Backstube und Routen.',
  'admin.password.title': 'Passwort ändern',
  'admin.password.required': 'Bitte lege ein eigenes Passwort fest, bevor du weiterarbeitest.',
  'admin.password.current': 'Aktuelles Passwort',
  'admin.password.new': 'Neues Passwort (mind. {min} Zeichen)',
  'admin.password.submit': 'Passwort ändern',
  'admin.password.wrong': 'Das aktuelle Passwort stimmt nicht.',
  'admin.password.done': 'Passwort geändert.',
} as const;

export type MessageKey = keyof typeof de;
