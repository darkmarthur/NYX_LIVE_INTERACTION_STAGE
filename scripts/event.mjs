// Public event information only. Never reads participant data or Google secrets.
export const EVENT = Object.freeze({
  uid: 'nyx-sonoro-ocampo-20261022@nyxsonoro.netlify.app',
  title: 'NYX Sonoro · Live Set / Performance',
  location: 'Teatro Ocampo, Cuernavaca, Morelos',
  date: '2026-10-22',
  startsAt: '2026-10-22T19:00:00-06:00',
  timeZone: 'America/Mexico_City',
  // Only an actual start time is known. Do not invent an end time or duration.
  description: 'NYX Sonoro en el Teatro Ocampo, Cuernavaca. 22 de octubre de 2026, 19:00 h (hora de Ciudad de México). Hora de término no especificada.',
  url: 'https://nyxsonoro.netlify.app/'
});
export const CALENDAR_FILE = 'nyx-sonoro-22-octubre-2026.ics';
const utcStamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escapeText = value => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// RFC 5545: fold UTF-8 lines at 75 octets; never split a multibyte character.
export function foldCalendarLine(line) {
  const lines = [];
  let current = '', octets = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character, 'utf8');
    if (octets + bytes > 75) { lines.push(current); current = ' '; octets = 1; }
    current += character; octets += bytes;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function calendarFile(event = EVENT) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NYX Sonoro//Concierto Ocampo//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    'UID:' + event.uid,'DTSTAMP:20261021T120000Z','DTSTART:' + utcStamp(event.startsAt),
    'SUMMARY:' + escapeText(event.title),'LOCATION:' + escapeText(event.location),
    'DESCRIPTION:' + escapeText(event.description),'URL:' + event.url,'STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'];
  // DTSTART without DTEND is a start-only event, not an invented one-hour block.
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
export function googleCalendarURL(event = EVENT) {
  const start = utcStamp(event.startsAt);
  const query = new URLSearchParams({ action:'TEMPLATE',text:event.title,dates:start + '/' + start,
    stz:event.timeZone,etz:event.timeZone,ctz:event.timeZone,details:event.description,location:event.location });
  return 'https://calendar.google.com/calendar/r/eventedit?' + query;
}
export function eventHTML(event = EVENT) {
  return `<aside class="event-card" aria-label="Información del concierto">
<div class="event-copy"><strong>NYX SONORO <span id="event-relative" class="event-relative" hidden></span></strong><span>Teatro Ocampo · Cuernavaca</span><time datetime="${escapeHTML(event.startsAt)}">22 de octubre de 2026 · 19:00 h</time></div>
<details class="event-calendar" id="event-calendar"><summary>AÑADIR AL<br>CALENDARIO <span aria-hidden="true">＋</span></summary><div class="calendar-options"><a href="${escapeHTML(googleCalendarURL(event))}" target="_blank" rel="noopener noreferrer">Google Calendar ↗</a><a href="/${CALENDAR_FILE}" type="text/calendar" target="_blank" rel="noopener noreferrer">Apple / Outlook (.ics)</a><small>Confirma para guardarlo. En Android, usa Google Calendar. Si no abre, prueba Safari o Chrome.</small></div></details>
</aside>`;
}
// The same pure function is tested on the server and embedded in the browser.
export function relativeEventLabel(now, event = EVENT) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone:event.timeZone,year:'numeric',month:'2-digit',day:'2-digit' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map(part => [part.type,part.value]));
  const today = parts.year + '-' + parts.month + '-' + parts.day;
  if (today === event.date) return 'HOY';
  const previous = new Date(event.date + 'T12:00:00Z');
  previous.setUTCDate(previous.getUTCDate() - 1);
  return today === previous.toISOString().slice(0,10) ? 'MAÑANA' : '';
}
export function eventClientScript(event = EVENT) {
  return `\n;(() => {
const event = ${JSON.stringify(event)};
const labelFor = ${relativeEventLabel.toString()};
const badge = document.querySelector('#event-relative');
let midnightTimer;
function refreshEventDay() {
  clearTimeout(midnightTimer);
  try { const label = labelFor(Date.now(), event); if (badge) { badge.textContent = label; badge.hidden = !label; } } catch { if (badge) badge.hidden = true; }
  // At most two local-midnight transitions for this event, not polling.
  const next = ['2026-10-22T00:00:00-06:00','2026-10-23T00:00:00-06:00'].map(Date.parse).find(time => time > Date.now());
  if (next && next - Date.now() < 2147483000) midnightTimer = setTimeout(refreshEventDay, next - Date.now() + 100);
}
refreshEventDay();
window.addEventListener('pageshow', refreshEventDay);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshEventDay(); });
const menu = document.querySelector('#event-calendar');
menu?.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary')?.focus(); } });
document.addEventListener('click', e => { if (menu?.open && !menu.contains(e.target)) menu.open = false; });
})();\n`;
}
export const EVENT_CSS = `
/* Event details stay visible even if the participation API is unavailable. */
.event-card{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);padding:12px 0;flex-shrink:0;position:relative;z-index:3}.event-copy{display:grid;gap:5px;min-width:0;line-height:1.35}.event-copy strong{font:700 12px/1.4 var(--mono);color:var(--fg);letter-spacing:.4px}.event-copy>span{font-size:12px;color:var(--fg)}.event-copy time{font-size:11px;color:var(--muted);white-space:nowrap}.event-relative{display:inline-block;color:var(--bg);background:var(--accent);padding:2px 5px;font:700 10px var(--mono);margin-left:4px}.event-calendar{position:relative;flex-shrink:0}.event-calendar summary{list-style:none;cursor:pointer;min-height:44px;display:block;padding:9px 8px;border:1px solid var(--accent);color:var(--accent);font:700 10px/1.5 var(--mono);letter-spacing:.15px}.event-calendar summary::-webkit-details-marker{display:none}.event-calendar summary:focus-visible{outline:2px solid var(--pink);outline-offset:3px}.calendar-options{position:absolute;right:0;top:calc(100% + 6px);min-width:218px;border:1px solid var(--accent);padding:6px;background:var(--bg);box-shadow:0 12px 36px #000a}.calendar-options a{display:flex;align-items:center;min-height:44px;padding:8px 10px;font-size:13px;color:var(--fg);text-decoration:none}.calendar-options a:hover,.calendar-options a:focus-visible{background:var(--surface);color:var(--accent)}.calendar-options small{display:block;padding:6px 10px;font-size:10px;color:var(--muted)}
body[data-page="photo"] main,body[data-page="text"] main{padding:16px 0}body[data-page="text"] textarea{height:clamp(82px,12svh,115px)}
@media(max-width:380px){.event-card{gap:6px}.event-copy time{font-size:10px}.event-copy>span{font-size:11px}.event-calendar summary{font-size:9px;padding:8px 6px}.event-copy strong{font-size:11px}}
@media(max-height:720px){.event-card{padding:8px 0}.event-copy{gap:3px}.topbar{height:52px}.home-banner{min-height:40svh}body[data-page="photo"] main,body[data-page="text"] main{justify-content:center;padding:8px 0}body[data-page="text"] .lead{display:block;margin-bottom:9px}body[data-page="text"] .eyebrow{display:none}body[data-page="text"] textarea{height:82px;min-height:65px}body[data-page="photo"] .photo-frame{height:124px}.eyebrow{font-size:10px}}
@media(max-height:600px){.topbar{height:48px}.event-card{padding:6px 0}body[data-page="photo"] .eyebrow,body[data-page="text"] .eyebrow{display:none}body[data-page="photo"] h1{font-size:20px;line-height:1.04;margin:7px 0}body[data-page="text"] h1{font-size:24px;margin:7px 0}body[data-page="photo"] .photo-frame{height:101px}body[data-page="text"] textarea{height:65px;min-height:65px}.flow fieldset{gap:6px}.lead{font-size:12px;margin-bottom:8px}.footer{min-height:44px}.receipt-panel{gap:10px;padding:8px 0}.receipt-mark{font-size:36px}.receipt-panel h1{font-size:28px}}
`;
