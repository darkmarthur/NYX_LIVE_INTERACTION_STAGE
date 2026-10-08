export const DEFAULTS = Object.freeze({
  eventId: 'nyx-ocampo-2026',
  eventName: 'NYX Sonoro',
  venue: 'Teatro Ocampo · Cuernavaca',
  eventLabel: '22 de octubre de 2026 · 19:00 h',
  opensAt: '2026-10-08T00:00:00-06:00',
  closesAt: '2026-10-22T19:00:00-06:00',
  purgeAt: '2026-10-23T10:00:00-06:00',
  termsVersion: '2026-10-08-v1',
  maxPhotoBytes: 1048576,
  maxPhotoSide: 2048,
  maxOriginalBytes: 20971520,
  maxAnswerLength: 500
});

export function settingsFrom(env, allowHttp = false) {
  const s = { ...DEFAULTS };
  for (const [key, variable] of Object.entries({ eventId: 'EVENT_ID', opensAt: 'OPENS_AT', closesAt: 'CLOSES_AT', purgeAt: 'PURGE_AT', termsVersion: 'TERMS_VERSION' })) {
    if (env[variable]) s[key] = env[variable];
  }
  const times = [s.opensAt, s.closesAt, s.purgeAt].map(Date.parse);
  if (times.some(x => !Number.isFinite(x)) || times[0] >= times[1] || times[1] >= times[2]) throw new Error('INVALID_SETTINGS');
  if (!/^[a-z0-9-]{3,60}$/.test(s.eventId) || !/^[a-zA-Z0-9.-]{1,50}$/.test(s.termsVersion)) throw new Error('INVALID_SETTINGS');
  s.deleteBy = new Date(times[2] + 2 * 3600000).toISOString();
  s.controller = (env.PRIVACY_CONTROLLER || '').trim();
  s.address = (env.PRIVACY_ADDRESS || '').trim();
  s.contact = (env.PRIVACY_EMAIL || '').trim();
  const origin = env.SITE_ORIGIN || '';
  const validOrigin = /^https:\/\/[^/]+$/.test(origin) || (allowHttp && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
  s.ready = Boolean(validOrigin && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.APPS_SCRIPT_URL || '') && (env.BRIDGE_SECRET || '').length >= 32 && s.controller && s.address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.contact) && env.LEGAL_APPROVED === 'true');
  s.collectionOpen = env.COLLECTION_OPEN === 'true';
  return s;
}

export function phaseAt(settings, now = Date.now()) {
  if (now >= Date.parse(settings.closesAt)) return 'closed';
  if (now < Date.parse(settings.opensAt)) return 'soon';
  return settings.collectionOpen && settings.ready ? 'open' : 'paused';
}
