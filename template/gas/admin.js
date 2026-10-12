// Host-side: sheet setup, custom menu, invites, daily reminders, host notifications.

const NOTIFY_ACTIONS = ['rsvp', 'cancel', 'room_request', 'confirm', 'food', 'trip'];

// Every top-level function without a trailing underscore is callable by any visitor through google.script.run.
// Host-side entry points call this first. Allowed: a real installable trigger (event carries a live triggerUid)
// or the signed-in host themselves (menu click in their own Sheet).
function hostOnly_(e) {
  const uid = e && typeof e === 'object' ? e.triggerUid : '';
  if (uid && ScriptApp.getProjectTriggers().some((t) => String(t.getUniqueId()) === String(uid))) return;
  const me = Session.getActiveUser().getEmail();
  if (me && me === Session.getEffectiveUser().getEmail()) return;
  throw new Error('Host only.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Invite app')
    .addItem('Set up / repair tabs', 'setup')
    .addItem('Generate missing tokens', 'generateTokens')
    .addItem('Email invites to selected rows', 'emailInvitesToSelection')
    .addItem('Text invites to selected rows', 'textInvitesToSelection')
    .addItem('Install triggers (reminders + notifications)', 'installTriggers')
    .addItem('Run today\'s reminders now', 'dailyRun')
    .addToUi();
}

function setup() {
  hostOnly_();
  const ss = SpreadsheetApp.getActive();
  // Read before the tab loop rewrites headers: older sheets have key | value | note.
  const existing = {};
  if (sheet_('Settings')) rows_('Settings').forEach((r) => (existing[r.key] = r));
  for (const name of tabNames_()) {
    const head = TABS[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const rows = settingsRows(NOTIFY_ACTIONS, existing, {
    host_email: Session.getEffectiveUser().getEmail(),
    ntfy_topic: 'invite-' + Utilities.getUuid().slice(0, 12),
    admin_key: Utilities.getUuid(),
  });
  const sh = sheet_('Settings');
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  const table = [TABS.Settings, ...rows.map((r) => (r.heading ? ['', r.heading, '', ''] : [r.key, r.label, r.value, r.note]))];
  sh.getRange(1, 1, table.length, 4).setValues(table);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  sh.getRange(2, 1, table.length - 1, 1).setFontColor('#999999');
  sh.setFrozenRows(1);
  rows.forEach((r, i) => {
    if (r.heading) sh.getRange(i + 2, 1, 1, 4).setFontWeight('bold').setBackground('#efe9dd');
    else if (typeof r.value === 'boolean') sh.getRange(i + 2, 3).insertCheckboxes();
  });
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 220);
  sh.setColumnWidth(4, 480);
  if (modOn_('trips') && !rows_('Trips').length) {
    for (const t of EVENT.trip_seeds) {
      appendRow_('Trips', { id: Utilities.getUuid().slice(0, 8), title: t.title, details: t.details, created_at: now_() });
    }
  }  // Hosts smoke-test before the invite step, and confirmations only go out via the 5-minute trigger.
  installTriggers();
}

function generateTokens() {
  hostOnly_();
  const sh = sheet_('Guests');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] && !values[i][0]) sh.getRange(i + 1, 1).setValue(newToken_());
  }
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

// Guests in the selected rows (tokens generated first).
function selectedRows_() {
  generateTokens();
  const sel = SpreadsheetApp.getActiveRange();
  const first = sel.getRow();
  const last = first + sel.getNumRows() - 1;
  const s = settings_();
  return { s, guests: rows_('Guests').filter((g) => g._row >= first && g._row <= last && g.token) };
}

function markInvited_(g, detail) {
  appendRow_('Log', { ts: now_(), token: g.token, action: 'invite_sent', detail });
  if (!g.status) updateRow_('Guests', g._row, { status: 'invited' });
}

function emailInvitesToSelection() {
  hostOnly_();
  const { s, guests } = selectedRows_();
  if (!guestEmailOn('invite', s)) throw new Error('Invite emails are turned off in Settings.');
  let sent = 0;
  for (const g of guests) {
    if (!g.email) continue;
    const link = guestLink_(s, g);
    const copy = guestCopy_('invite', s, guestVars_(g), { invite_link: anchor_(link, 'your invite', '#8a3b2e') }, `You're invited: ${EVENT.title}`);
    MailApp.sendEmail(guestMail_(s, {
      to: g.email,
      subject: copy.subject,
      htmlBody: guestEmailHtml_(copy, [`Hi ${firstName_(g.name)}!`, EVENT.tagline,
        `${EVENT.main.label}: ${EVENT.when_text} · ${EVENT.area}`], 'See the invite & RSVP', link),
    }));
    markInvited_(g, g.email);
    sent++;
  }
  SpreadsheetApp.getActive().toast(`Sent ${sent} invite email(s).`);
}

// Emails the host one tap-to-text link per guest with a phone; Gmail strips sms: hrefs, so links go via site/sms.html.
function textInvitesToSelection() {
  hostOnly_();
  const { s, guests } = selectedRows_();
  if (!s.host_email) throw new Error('Set host_email in Settings first.');
  const texts = [];
  for (const g of guests) {
    if (!g.phone) continue;
    const body = `You're invited: ${EVENT.title}! ${EVENT.main.label}: ${EVENT.when_text}. See the invite & RSVP: ${guestLink_(s, g)}`;
    texts.push({ name: g.name, href: smsLink_(s, g.phone, body) });
    markInvited_(g, g.phone);
  }
  if (!texts.length) return SpreadsheetApp.getActive().toast('No guests with a phone in the selection.');
  MailApp.sendEmail({
    to: s.host_email,
    subject: `Text ${texts.length} invite(s)`,
    htmlBody: '<p>Tap each to open Messages with the invite ready to send:</p><ul>' +
      texts.map((t) => `<li><a href="${esc_(t.href)}">${esc_(t.name)}</a></li>`).join('') + '</ul>',
  });
  SpreadsheetApp.getActive().toast(`Emailed you ${texts.length} text link(s).`);
}

function installTriggers() {
  hostOnly_();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyRun').timeBased().atHour(9).everyDays(1).inTimezone(EVENT.timezone).create();
  ScriptApp.newTrigger('flushNotifications').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('Daily reminders at 9am + notifications every 5 min.');
}

// Sends host notifications for Log rows not yet notified; stamps each row so it's sent once.
function flushNotifications(e) {
  hostOnly_(e);
  const s = settings_();
  const pending = rows_('Log').filter((l) => !l.notified && (NOTIFY_ACTIONS.includes(l.action) || l.action === 'guest_confirmed'));
  for (const l of pending) {
    let result;
    try {
      result = l.action === 'guest_confirmed' ? emailGuestConfirmed_(l, s) : notifyHost_(l.action, l.detail, s).join('+') || 'off';
    } catch (err) {
      result = 'error: ' + String(err.message || err).slice(0, 200);
    }
    updateRow_('Log', l._row, { notified: result });
  }
  return pending.length;
}

// `today` override lets you rehearse a reminder day from the script editor: dailyRun('2026-11-28').
function dailyRun(today) {
  hostOnly_(today);
  const day = typeof today === 'string' ? today : Utilities.formatDate(new Date(), EVENT.timezone, 'yyyy-MM-dd');
  const s = settings_();
  const guests = rows_('Guests').map((g) => ({ ...g, status: g.status || 'invited' }));
  const byToken = Object.fromEntries(guests.map((g) => [g.token, g]));
  const due = dueMessages(guests, EVENT.main.start.slice(0, 10), day, EVENT.reminders);
  const texts = [];
  for (const m of due) {
    const g = byToken[m.token];
    const link = guestLink_(s, g) + (m.kind === 'confirm' ? `&confirm=${m.days}` : '');
    const line = m.kind === 'confirm'
      ? `${EVENT.title} is ${m.days} days out! Still coming? Tap to confirm: ${link}`
      : `${m.days} days until ${EVENT.title}! Your invite: ${link}`;
    if (m.channel === 'email') {
      if (!guestEmailOn(m.kind, s)) continue;
      const copy = guestCopy_(m.kind, s, guestVars_(g, { days: m.days }), { invite_link: anchor_(link, 'your invite', '#8a3b2e') },
        m.kind === 'confirm' ? `Still coming? Confirm for ${EVENT.title}` : `${m.days} days until ${EVENT.title}`);
      MailApp.sendEmail(guestMail_(s, {
        to: g.email,
        subject: copy.subject,
        htmlBody: guestEmailHtml_(copy, [`Hi ${firstName_(g.name)}!`, line.split(':')[0] + '.', ''],
          m.kind === 'confirm' ? 'Yes, I\'m still coming' : 'Open my invite', link),
      }));
    } else {
      texts.push({ name: g.name, href: smsLink_(s, g.phone, line) });
    }
    appendRow_('Log', { ts: now_(), token: g.token, action: 'sent_' + m.kind, detail: `${m.days}d ${m.channel}` });
  }
  if (texts.length && s.host_email) {
    MailApp.sendEmail({
      to: s.host_email,
      subject: `Text ${texts.length} guest(s) today`,
      htmlBody: '<p>Tap each to open Messages with the text ready to send:</p><ul>' +
        texts.map((t) => `<li><a href="${t.href}">${esc_(t.name)}</a></li>`).join('') + '</ul>',
    });
  }
  return due;
}

function notifyHost_(action, detail, s) {
  const channels = notifyChannels(action, s);
  const sent = [];
  if (channels.includes('email') && s.host_email) {
    MailApp.sendEmail(s.host_email, `[${EVENT.title}] ${action.replace('_', ' ')}`, detail);
    sent.push('email');
  }
  if (channels.includes('push') && s.ntfy_topic) {
    const res = UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(s.ntfy_topic), {
      method: 'post', payload: detail, headers: { Title: action.replace('_', ' ') }, muteHttpExceptions: true,
    });
    sent.push('push:' + res.getResponseCode());
  }
  return sent;
}

// Queued by the rsvp action when a guest first says yes; sent here, never in the request path.
// Edit the copy below to your own voice. Palette from site/styles.css, as inline-styled tables (email clients ignore stylesheets).
function emailGuestConfirmed_(l, s) {
  const g = rows_('Guests').find((r) => r.token === l.token);
  if (!g || !g.email) return 'skipped';
  if (!guestEmailOn('confirmed', s)) return 'off';
  const at = (page) => esc_(pageUrl_(s, page, `t=${g.token}`));
  const a = (page, text) => `<a href="${at(page)}" style="color:#f7cd8e">${text}</a>`;
  const link = (page, text) => anchor_(pageUrl_(s, page, `t=${g.token}`), text, '#f7cd8e');
  const copy = guestCopy_('confirmed', s, guestVars_(g), {
    invite_link: link('index', 'your invite page'), menu_link: modOn_('menu') ? link('menu', 'the menu') : '',
    trips_link: modOn_('trips') ? link('trips', 'day trips') : '', calendar_link: link('details', 'add to calendar'),
  }, `You're in! ${EVENT.title}`);
  const hero = heroImage_(s);
  const serif = "Fraunces,Georgia,'Times New Roman',serif";
  const p = (html) => `<p style="margin:0 0 16px;font:17px/1.6 ${serif};color:#f6f0e6">${html}</p>`;
  const caps = `font:600 11px/1 'Instrument Sans',Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase`;
  const html = `<div style="background:#0f2523;padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#143029">
    ${hero.src ? `<tr><td><img src="${esc_(hero.src)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
    <tr><td style="padding:32px 32px 8px">
      <div style="${caps};color:#f2b25c;margin-bottom:14px">You're in</div>
      <h1 style="margin:0 0 24px;font:400 30px/1.15 ${serif};color:#f6f0e6">${esc_(EVENT.title)}</h1>
      ${(copy.paragraphs || [
    `Hi ${esc_(firstName_(g.name))}!`,
    `You're confirmed for ${esc_(EVENT.title)} (${esc_(EVENT.when_text)}). Be sure to add this to your calendar.` + signUp_(a) + ` See everything on your ` + a('index', 'invite page') + '.',
    'Expect a reminder to confirm your plans closer to the day!',
    "I'm excited to host you!",
    'Cheers!<br>Your host',
  ]).map(p).join('\n      ')}
      <p style="margin:24px 0 8px"><a href="${at('details')}" style="display:inline-block;background:#f2b25c;color:#0f2523;padding:14px 24px;border-radius:2px;text-decoration:none;${caps}">Add to calendar</a></p>
    </td></tr>
    <tr><td style="padding:16px 32px 28px;border-top:1px solid #2a3f3a;font:12px/1.5 Helvetica,Arial,sans-serif;color:#a9b9b4">These links are just for you. Please don't forward this email.</td></tr>
  </table></div>`;
  const mail = { to: g.email, subject: copy.subject, htmlBody: html };
  if (hero.blob) mail.inlineImages = { hero: hero.blob };
  MailApp.sendEmail(guestMail_(s, mail));
  return 'guest-email';
}

// Older events have no `features`; every module counts as on there.
function modOn_(id) { return !EVENT.features || EVENT.features.includes(id); }

// "You can sign up for food/drinks and set up a day trip." with only the modules that are on.
function signUp_(a) {
  const parts = [];
  if (modOn_('menu')) parts.push('sign up for ' + a('menu', 'food/drinks'));
  if (modOn_('trips')) parts.push('set up a ' + a('trips', 'day trip'));
  return parts.length ? ` You can ${parts.join(' and ')}.` : '';
}

function guestVars_(g, extra) {
  return { first_name: firstName_(g.name), title: EVENT.title, when: EVENT.when_text, ...extra };
}

function anchor_(href, text, color) {
  return { html: `<a href="${esc_(href)}" style="color:${color}">${esc_(text)}</a>` };
}

// Host-written subject/body from Settings win; a blank one falls back to the built-in wording.
// Substituted values are HTML-escaped in the body, so a guest's name can't inject markup.
function guestCopy_(kind, s, vars, links, defaultSubject) {
  const subject = copyOverride(kind, 'subject', s);
  const body = copyOverride(kind, 'body', s);
  return {
    subject: subject ? cleanText(fillTemplate(subject, vars, String), 200) : defaultSubject,
    paragraphs: body ? toParagraphs(fillTemplate(body, { ...vars, ...links }, esc_)) : null,
  };
}

function guestEmailHtml_(copy, defaults, cta, href) {
  return copy.paragraphs
    ? emailHtml_('', copy.paragraphs.map((html) => ({ html })), '', cta, href)
    : emailHtml_(defaults[0], defaults[1], defaults[2], cta, href);
}

function guestMail_(s, opts) {
  const out = { ...opts };
  if (s.guest_from_name) out.name = String(s.guest_from_name);
  if (s.guest_reply_to) out.replyTo = String(s.guest_reply_to);
  return out;
}

// Where a page lives: the host's own site when Settings has site_url, else this script's web app.
function pageUrl_(s, page, query) {
  if (s.site_url) return `${s.site_url}/${page === 'index' ? '' : page + '.html'}?${query}`;
  // From a Sheet menu, getService().getUrl() is not the live /exec URL (links opened a Drive error), so prefer the saved api_url.
  return `${EVENT.api_url || ScriptApp.getService().getUrl()}?page=${page}&${query}`;
}

// Gmail won't load images from an Apps Script URL, so without a site the hero rides along as an inline attachment.
function heroImage_(s) {
  if (s.site_url) return { src: `${s.site_url}/${EVENT.images.hero.src}` };
  if (typeof HERO_B64 === 'undefined' || !HERO_B64) return {};
  return { src: 'cid:hero', blob: Utilities.newBlob(Utilities.base64Decode(HERO_B64), 'image/jpeg', 'hero.jpg') };
}

function guestLink_(s, g) {
  return pageUrl_(s, 'index', `t=${g.token}`);
}

// https page that hands off to sms: (Gmail strips sms: hrefs).
function smsLink_(s, phone, body) {
  return pageUrl_(s, 'sms', `to=${encodeURIComponent(String(phone).replace(/[^\d+]/g, ''))}&body=${encodeURIComponent(body)}`);
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function emailHtml_(greeting, line1, line2, cta, href) {
  return `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:24px;color:#2b2320">
    <h2 style="margin:0 0 12px">${esc_(EVENT.title)}</h2>
    ${greeting ? `<p>${esc_(greeting)}</p>` : ''}${[].concat(line1, line2 || []).map((t) => `<p>${t.html !== undefined ? t.html : esc_(t)}</p>`).join('')}
    <p><a href="${esc_(href)}" style="display:inline-block;background:#8a3b2e;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">${esc_(cta)}</a></p>
    <p style="font-size:12px;color:#7a6d66">This link is just for you. Please don't forward it.</p></div>`;
}
