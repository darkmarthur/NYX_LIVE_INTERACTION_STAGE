import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { EVENT, CALENDAR_FILE, calendarFile, foldCalendarLine, googleCalendarURL, eventHTML, relativeEventLabel, eventClientScript, EVENT_CSS } from '../scripts/event.mjs';

test('La fecha del concierto conserva las 19:00 de Cuernavaca', () => {
  assert.equal(new Date(EVENT.startsAt).toISOString(), '2026-10-23T01:00:00.000Z');
  assert.equal(EVENT.date, '2026-10-22');
  assert.equal(EVENT.timeZone, 'America/Mexico_City');
});
test('La víspera dice MAÑANA, incluso cuando en UTC ya es 22', () => {
  assert.equal(relativeEventLabel('2026-10-21T12:00:00-06:00'), 'MAÑANA');
  assert.equal(relativeEventLabel('2026-10-22T05:59:59Z'), 'MAÑANA');
});
test('A medianoche local cambia a HOY y no conserva un MAÑANA vencido', () => {
  assert.equal(relativeEventLabel('2026-10-22T06:00:00Z'), 'HOY');
  assert.equal(relativeEventLabel('2026-10-22T23:59:59-06:00'), 'HOY');
  assert.equal(relativeEventLabel('2026-10-23T00:00:00-06:00'), '');
  assert.equal(relativeEventLabel('2026-10-20T12:00:00-06:00'), '');
});
test('ICS UTF-8: CRLF, UID estable, inicio correcto, sin fin inventado ni alarmas', () => {
  const calendar = calendarFile();
  assert.ok(calendar.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
  assert.ok(calendar.includes('DTSTART:20261023T010000Z\r\n'));
  assert.ok(calendar.includes('UID:' + EVENT.uid + '\r\n'));
  assert.ok(!calendar.includes('DTEND:') && !calendar.includes('DURATION:'));
  assert.ok(!calendar.includes('ATTENDEE') && !calendar.includes('VALARM'));
  assert.ok(!/(?<!\r)\n/.test(calendar));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});
test('ICS conserva tildes al plegar y desdoblar líneas', () => {
  const text = 'DESCRIPTION:' + 'Música, chelo y síntesis 🌌; '.repeat(20);
  const folded = foldCalendarLine(text);
  assert.equal(folded.replace(/\r\n /g, ''), text);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});
test('Google Calendar prepara el evento, sin acceder al calendario del usuario', () => {
  const url = new URL(googleCalendarURL());
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), EVENT.title);
  assert.equal(url.searchParams.get('dates'), '20261023T010000Z/20261023T010000Z');
  assert.equal(url.searchParams.get('ctz'), EVENT.timeZone);
  assert.equal(url.searchParams.get('location'), EVENT.location);
  assert.equal(url.searchParams.get('details'), EVENT.description);
});
test('El bloque estático tiene nombre, fecha completa, lugar y dos opciones', () => {
  const html = eventHTML();
  for (const text of ['NYX SONORO','Teatro Ocampo','22 de octubre de 2026','19:00 h','AÑADIR AL','Google Calendar','Apple / Outlook']) assert.ok(html.includes(text));
  assert.ok(html.includes('href="/' + CALENDAR_FILE + '"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!html.includes('<iframe') && !html.includes('<script'));
});
test('El banner permanece fuera del contenido reemplazado por el envío', () => {
  const template = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(template.indexOf('<!--EVENT-->') < template.indexOf('<main'));
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.ok(build.includes("contents['app.js'] += eventClientScript()"));
  assert.ok(build.includes('calendarFile()'));
});
test('JS válido, sin consultas de red ni sondeo; opciones accesibles', () => {
  new Script(eventClientScript());
  assert.ok(!/\bfetch\(|setInterval\(|XMLHttpRequest/.test(eventClientScript()));
  assert.ok(EVENT_CSS.includes('min-height:44px'));
  assert.ok(EVENT_CSS.includes(':focus-visible'));
});
