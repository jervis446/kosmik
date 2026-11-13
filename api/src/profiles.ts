/**
 * "My details": birth details for the kundli and photos of both palms, stored per person with
 * their consent. Also the birth place search (OpenStreetMap Nominatim: the place name only is sent).
 */
import type { BirthDetails } from './lib/chart.ts';

export type Hand = 'left' | 'right';
export type Profile = { name: string | null; birthDate: string; birthTime: string | null; place: string; lat: number; lon: number; tzOffsetMin: number };
export type PalmPhoto = { hand: Hand; mime: string; data: string };

export class ProfileError extends Error {}

export const toBirth = (p: Profile): BirthDetails => ({ date: p.birthDate, time: p.birthTime, tzOffsetMin: p.tzOffsetMin, lat: p.lat, lon: p.lon });

export interface Profiles {
  get(userId: string): Promise<Profile | null>;
  palms(userId: string): Promise<PalmPhoto[]>;
}

type Row = { name: string | null; birth_date: string; birth_time: string | null; place: string; lat: number; lon: number; tz_offset_min: number };

const b64 = (bytes: ArrayBuffer | Uint8Array | number[]) => {
  const u = bytes instanceof Uint8Array ? bytes : Array.isArray(bytes) ? Uint8Array.from(bytes) : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class D1Profiles implements Profiles {
  private readonly db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }
  async get(userId: string): Promise<Profile | null> {
    const r = await this.db.prepare('SELECT name, birth_date, birth_time, place, lat, lon, tz_offset_min FROM profiles WHERE user_id = ?').bind(userId).first<Row>();
    return r ? { name: r.name, birthDate: r.birth_date, birthTime: r.birth_time, place: r.place, lat: r.lat, lon: r.lon, tzOffsetMin: r.tz_offset_min } : null;
  }
  async palms(userId: string): Promise<PalmPhoto[]> {
    const { results } = await this.db.prepare('SELECT hand, mime, data FROM palm_photos WHERE user_id = ? ORDER BY hand').bind(userId).all<{ hand: Hand; mime: string; data: ArrayBuffer }>();
    return results.map((r) => ({ hand: r.hand, mime: r.mime, data: b64(r.data) }));
  }
  async palmStatus(userId: string): Promise<Record<Hand, number | null>> {
    const { results } = await this.db.prepare('SELECT hand, updated_at FROM palm_photos WHERE user_id = ?').bind(userId).all<{ hand: Hand; updated_at: number }>();
    return { left: results.find((r) => r.hand === 'left')?.updated_at ?? null, right: results.find((r) => r.hand === 'right')?.updated_at ?? null };
  }
  async palm(userId: string, hand: Hand): Promise<PalmPhoto | null> {
    const r = await this.db.prepare('SELECT mime, data FROM palm_photos WHERE user_id = ? AND hand = ?').bind(userId, hand).first<{ mime: string; data: ArrayBuffer }>();
    return r ? { hand, mime: r.mime, data: b64(r.data) } : null;
  }
  async save(userId: string, body: Record<string, unknown>, now: number): Promise<Profile> {
    const p = parseProfile(body);
    await this.db
      .prepare(
        `INSERT INTO profiles (user_id, name, birth_date, birth_time, place, lat, lon, tz_offset_min, consent_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, birth_date = excluded.birth_date, birth_time = excluded.birth_time,
           place = excluded.place, lat = excluded.lat, lon = excluded.lon, tz_offset_min = excluded.tz_offset_min, updated_at = excluded.updated_at`,
      )
      .bind(userId, p.name, p.birthDate, p.birthTime, p.place, p.lat, p.lon, p.tzOffsetMin, now, now)
      .run();
    return p;
  }
  async savePalm(userId: string, hand: unknown, body: Record<string, unknown>, now: number): Promise<void> {
    if (hand !== 'left' && hand !== 'right') throw new ProfileError('Choose the left or right hand.');
    if (body.consent !== true) throw new ProfileError('Please agree to Kosmik keeping your palm photos.');
    const mime = typeof body.mime === 'string' ? body.mime.toLowerCase() : '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new ProfileError('Send a JPEG, PNG or WebP photo.');
    if (typeof body.image !== 'string' || body.image.length < 1000 || body.image.length > MAX_PHOTO_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
      throw new ProfileError('That photo couldn’t be read, or is too large. Please try another.');
    }
    await this.db
      .prepare('INSERT INTO palm_photos (user_id, hand, mime, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, hand) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at')
      .bind(userId, hand, mime, unb64(body.image), now)
      .run();
  }
  async deletePalm(userId: string, hand: unknown): Promise<void> {
    if (hand !== 'left' && hand !== 'right') throw new ProfileError('Choose the left or right hand.');
    await this.db.prepare('DELETE FROM palm_photos WHERE user_id = ? AND hand = ?').bind(userId, hand).run();
  }
  async deleteAll(userId: string): Promise<void> {
    await this.db.batch([this.db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(userId), this.db.prepare('DELETE FROM palm_photos WHERE user_id = ?').bind(userId)]);
  }
}

export const MAX_PHOTO_BASE64 = 2_000_000;

export function parseProfile(b: Record<string, unknown>): Profile {
  if (b.consent !== true) throw new ProfileError('Please agree to Kosmik keeping your birth details.');
  const birthDate = typeof b.birthDate === 'string' ? b.birthDate : '';
  const birthTime = b.birthTime === null || b.birthTime === undefined || b.birthTime === '' ? null : String(b.birthTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate + 'T00:00:00Z'))) throw new ProfileError('Enter your date of birth.');
  const year = Number(birthDate.slice(0, 4));
  if (year < 1900 || Date.parse(birthDate + 'T00:00:00Z') > Date.now()) throw new ProfileError('Enter a date of birth between 1900 and today.');
  if (birthTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime)) throw new ProfileError('Enter the birth time as HH:MM (24-hour), or tick “I don’t know my birth time”.');
  const place = typeof b.place === 'string' ? b.place.trim().slice(0, 200) : '';
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  const tz = Number(b.tzOffsetMin);
  if (!place || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ProfileError('Choose your place of birth from the search results.');
  if (!Number.isInteger(tz) || tz < -720 || tz > 840 || tz % 15 !== 0) throw new ProfileError('Choose the time zone at the place of birth.');
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : null;
  return { name, birthDate, birthTime, place, lat, lon, tzOffsetMin: tz };
}

export type Place = { name: string; lat: number; lon: number; country: string; tzOffsetMin: number | null };

/** Looks up a birth place. India has one time zone (+05:30); elsewhere the person picks theirs. */
export async function searchPlaces(q: string, baseUrl = 'https://nominatim.openstreetmap.org'): Promise<Place[]> {
  const query = q.trim().slice(0, 100);
  if (query.length < 2) return [];
  const url = `${baseUrl.replace(/\/+$/, '')}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Kosmik/1.0 (https://kosmik.asanoha.co.in)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string; address?: { country_code?: string } }[];
  return rows.map((r) => {
    const country = (r.address?.country_code ?? '').toLowerCase();
    return { name: r.display_name, lat: Number(r.lat), lon: Number(r.lon), country, tzOffsetMin: country === 'in' ? 330 : null };
  });
}
