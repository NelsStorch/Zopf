import { formatChf, formatDate, readableOn, translator, type Locale, type Translator } from '@zopf/shared';
import { config } from './config.js';
import { escapeHtml, type Mail } from './mail.js';

/**
 * Mails to customers, in their language. HTML is built here from plain values
 * (every value escaped); the browser never sends HTML. Each mail also has a
 * plain-text part with the same content.
 */

export interface OrderSummary {
  number: string | null;
  customerName: string;
  email: string;
  locale: Locale;
  items: { productName: string; sizeLabel: string; quantity: number; unitPriceRappen: number }[];
  donationRappen: number;
  totalRappen: number;
  address: { street: string; houseNumber: string; zip: string; city: string; manual: boolean };
  paymentMethod: 'QR_INVOICE' | 'ON_DELIVERY';
  campaign: { name: string; deliveryDate: Date; orderDeadline: Date };
}

const deadlineText = (date: Date, locale: Locale) =>
  date.toLocaleString(locale === 'de' ? 'de-CH' : 'en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Zurich' });

/** Text and HTML in step: blocks are paragraphs, a button, or the order table. */
type Block = { p: string } | { button: { label: string; url: string } } | { summary: OrderSummary } | { small: string };

function summaryLines(s: OrderSummary, t: Translator): string[] {
  const chf = (r: number) => `CHF ${formatChf(r, s.locale)}`;
  return [
    ...(s.number ? [`${t('summary.number')}: ${s.number}`] : []),
    ...s.items.map((i) => `${i.quantity} × ${i.productName} ${i.sizeLabel}: ${chf(i.quantity * i.unitPriceRappen)}`),
    ...(s.donationRappen > 0 ? [`${t('summary.donation')}: ${chf(s.donationRappen)}`] : []),
    `${t('summary.total')}: ${chf(s.totalRappen)}`,
    '',
    `${t('summary.address')}: ${`${s.address.street} ${s.address.houseNumber}`.trim()}, ${s.address.zip} ${s.address.city}`,
  ];
}

function summaryHtml(s: OrderSummary, t: Translator): string {
  const chf = (r: number) => `CHF&nbsp;${formatChf(r, s.locale)}`;
  const row = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7;${bold ? 'font-weight:700;' : ''}">${label}</td><td style="padding:6px 0 6px 16px;border-bottom:1px solid #e4e4e7;text-align:right;white-space:nowrap;${bold ? 'font-weight:700;' : ''}">${value}</td></tr>`;
  const rows = [
    ...s.items.map((i) => row(`${i.quantity} × ${escapeHtml(i.productName)} ${escapeHtml(i.sizeLabel)}`, chf(i.quantity * i.unitPriceRappen))),
    ...(s.donationRappen > 0 ? [row(escapeHtml(t('summary.donation')), chf(s.donationRappen))] : []),
    row(escapeHtml(t('summary.total')), chf(s.totalRappen), true),
  ].join('');
  const address = escapeHtml(`${`${s.address.street} ${s.address.houseNumber}`.trim()}, ${s.address.zip} ${s.address.city}`);
  return `${s.number ? `<p style="margin:0 0 8px;color:#52525b;">${escapeHtml(t('summary.number'))}: <strong>${escapeHtml(s.number)}</strong></p>` : ''}<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">${rows}</table><p style="margin:0 0 16px;"><span style="color:#52525b;">${escapeHtml(t('summary.address'))}:</span><br>${address}</p>`;
}

function render(locale: Locale, subject: string, blocks: Block[]): Mail & { locale: Locale } {
  const brand = config.brand;
  const t = translator(locale);
  const footer = [t('mail.footerSent', { appName: brand.appName, orgName: brand.orgName }), brand.postalAddress, brand.contactEmail].filter(Boolean) as string[];

  const text = [
    ...blocks.flatMap((b) => {
      if ('p' in b) return [b.p, ''];
      if ('small' in b) return [b.small, ''];
      if ('button' in b) return [`${b.button.label}: ${b.button.url}`, ''];
      return [...summaryLines(b.summary, t), ''];
    }),
    '--',
    ...footer,
  ].join('\n');

  const body = blocks
    .map((b) => {
      if ('p' in b) return `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(b.p)}</p>`;
      if ('small' in b) return `<p style="margin:0 0 16px;font-size:13px;color:#71717a;">${escapeHtml(b.small)}</p>`;
      if ('button' in b)
        return `<p style="margin:8px 0 24px;"><a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:${brand.primary};color:${readableOn(brand.primary)};padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none;">${escapeHtml(b.button.label)}</a></p>`;
      return summaryHtml(b.summary, t);
    })
    .join('');

  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
<div style="height:6px;background:linear-gradient(90deg,${brand.primary} 60%,${brand.secondary} 60%);border-radius:6px 6px 0 0;"></div>
<div style="background:#ffffff;padding:24px;border-radius:0 0 8px 8px;">
<p style="margin:0 0 20px;font-size:18px;font-weight:700;">${escapeHtml(brand.appName)} <span style="font-weight:400;color:#71717a;">· ${escapeHtml(brand.orgName)}</span></p>
${body}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#71717a;line-height:1.5;">${footer.map(escapeHtml).join('<br>')}</p>
</div></body></html>`;

  return { to: '', subject, text, html, locale };
}

const paymentBlock = (s: OrderSummary, t: Translator): Block => ({
  p: t(s.paymentMethod === 'QR_INVOICE' ? 'mail.payQr' : 'mail.payOnDelivery', { amount: formatChf(s.totalRappen, s.locale) }),
});

export function confirmRequestMail(s: OrderSummary, confirmUrl: string): Mail {
  const t = translator(s.locale);
  const brand = config.brand;
  return {
    ...render(s.locale, t('mail.confirm.subject'), [
      { p: t('mail.greeting', { name: s.customerName }) },
      { p: t('mail.confirm.intro', { appName: brand.appName, hours: config.orderConfirmHours }) },
      { button: { label: t('mail.confirm.button'), url: confirmUrl } },
      { summary: s },
      { small: t('mail.confirm.ignore') },
    ]),
    to: s.email,
  };
}

export function confirmedMail(s: OrderSummary, manageUrl: string, kind: 'confirmed' | 'changed' = 'confirmed'): Mail {
  const t = translator(s.locale);
  const number = s.number ?? '';
  return {
    ...render(s.locale, t(kind === 'confirmed' ? 'mail.confirmed.subject' : 'mail.changed.subject', { number }), [
      { p: t('mail.greeting', { name: s.customerName }) },
      { p: t(kind === 'confirmed' ? 'mail.confirmed.intro' : 'mail.changed.intro') },
      { summary: s },
      { p: t('mail.delivery', { date: formatDate(s.campaign.deliveryDate, s.locale) }) },
      paymentBlock(s, t),
      ...(s.address.manual ? [{ p: t('mail.addressCheck') }] : []),
      { button: { label: t('mail.manage'), url: manageUrl } },
      { small: t('mail.manageUntil', { date: deadlineText(s.campaign.orderDeadline, s.locale) }) },
    ]),
    to: s.email,
  };
}

export function cancelledMail(s: OrderSummary): Mail {
  const t = translator(s.locale);
  const number = s.number ?? '';
  return {
    ...render(s.locale, t('mail.cancelled.subject', { number }), [
      { p: t('mail.greeting', { name: s.customerName }) },
      { p: t('mail.cancelled.intro', { number }) },
    ]),
    to: s.email,
  };
}

export function linkMail(to: string, locale: Locale, orders: { number: string; url: string }[]): Mail {
  const t = translator(locale);
  return {
    ...render(locale, t('mail.link.subject'), [
      { p: t('mail.link.intro') },
      ...orders.map((o) => ({ button: { label: `${t('mail.manage')} (${o.number})`, url: o.url } })),
    ]),
    to,
  };
}

export { deadlineText };
