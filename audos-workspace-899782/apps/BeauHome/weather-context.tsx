/**
 * SHARED LOCATION + WEATHER (What-to-Wear × Fitting sync) — ONE module-level
 * location/weather state, displayed on the "What to wear today?" card on The
 * Ledger AND at the top of The Fitting. Changing the location in either place
 * updates both immediately (WEATHER_EVENT), no save button.
 *
 *  · Auto-detect: first use asks the browser Geolocation API, reverse-
 *    geocodes to a city (Nominatim, free) and reads the weather from
 *    Open-Meteo (free, no key). A stored city never re-prompts.
 *  · Manual override: a small city input, reachable from a "Change location"
 *    link beside the detected city — always available.
 *  · Persistence: the SAME localStorage key style-today has always used
 *    ('brummell_last_location'), so every weather-aware surface stays in
 *    step, including Beau's outfit reasoning (fitting-ai reads it too).
 *  · Beau context: sharedWeatherPromptLine() renders the current conditions
 *    as one prompt line for outfit composition.
 *  · FEELS-LIKE (Today weather-reasoning fix): the reading carries relative
 *    humidity AND the API's apparent temperature, and `feelsLike` is what
 *    every outfit gate filters on — 30°C at 80% humidity in Manila is not
 *    30°C in Madrid, and the pieces that survive the cut should differ.
 *
 * Design system: Lora body, hairline borders, no box-shadows; the dark tone
 * uses the walnut band's paper text, the light tone the standard neutrals.
 */
import { useEffect, useState } from 'react';
import { Loader2, LocateFixed, MapPin, X } from 'lucide-react';
import { feelsLikeC } from './warmth-model';

export interface SharedWeather {
  city: string;
  tempC: number;
  minC: number;
  maxC: number;
  precipProb: number;
  windKmh: number;
  /** Relative humidity %, when the API returns it. */
  humidity: number | null;
  /** The API's apparent temperature, when it returns one. */
  apparentC: number | null;
  /** THE filtering temperature: apparent temp, else heat index / wind chill,
   * else the raw reading. Every weather gate uses this, not `tempC`. */
  feelsLike: number | null;
  /** Brief condition label — Clear / Partly cloudy / Rain / Snow… */
  label: string;
  fetchedAt: number;
}

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** The one stored location for the whole app — same key style-today and
 * fitting-ai already read. */
const LAST_LOCATION_KEY = 'brummell_last_location';

/** Fired whenever the shared location/weather changes. */
export const WEATHER_EVENT = 'ethaion:weather';

const FRESH_MS = 30 * 60 * 1000;

let current: SharedWeather | null = null;
let status: WeatherStatus = 'idle';
let ensureStarted = false;

export function getSharedWeather(): SharedWeather | null {
  return current;
}

export function getStoredSharedCity(): string | null {
  try {
    const v = localStorage.getItem(LAST_LOCATION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function storeCity(city: string): void {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, city);
  } catch { /* storage unavailable — the module memory still holds it */ }
}

function notify(): void {
  window.dispatchEvent(new CustomEvent(WEATHER_EVENT));
}

function describeCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

async function fetchWeatherAt(lat: number, lon: number, city: string): Promise<SharedWeather | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      // relative_humidity_2m + apparent_temperature are what make the gate
      // reason about how the day FEELS rather than the raw digit.
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '1',
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const temp = Math.round(Number(data?.current?.temperature_2m ?? NaN));
    if (Number.isNaN(temp)) return null;
    const numberOrNull = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const humidity = numberOrNull(data?.current?.relative_humidity_2m);
    const apparentC = numberOrNull(data?.current?.apparent_temperature);
    const windKmh = Math.round(Number(data?.current?.wind_speed_10m ?? 0));
    return {
      city,
      tempC: temp,
      minC: Math.round(Number(data?.daily?.temperature_2m_min?.[0] ?? temp)),
      maxC: Math.round(Number(data?.daily?.temperature_2m_max?.[0] ?? temp)),
      precipProb: Math.round(Number(data?.daily?.precipitation_probability_max?.[0] ?? 0)),
      windKmh,
      humidity,
      apparentC,
      feelsLike: feelsLikeC({ tempC: temp, apparentC, humidity, windKmh }),
      label: describeCode(Number(data?.current?.weather_code ?? 1)),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Free-text city → coordinates via Open-Meteo's geocoding API (no key). */
async function geocodeCity(city: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    if (!res.ok) return null;
    const hit = (await res.json())?.results?.[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
    return { lat: hit.latitude, lon: hit.longitude, label: String(hit.name || city) };
  } catch {
    return null;
  }
}

/** Coordinates → city name via OpenStreetMap's Nominatim (free, no key). */
async function reverseGeocodeCity(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=en`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || null;
    return typeof city === 'string' && city.trim() ? city.trim() : null;
  } catch {
    return null;
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 600000 });
  });
}

/** Manual override — type a city, weather follows. Updates BOTH surfaces. */
export async function setSharedCity(city: string): Promise<boolean> {
  const q = city.trim();
  if (!q) return false;
  status = 'loading';
  notify();
  const geo = await geocodeCity(q);
  const w = geo ? await fetchWeatherAt(geo.lat, geo.lon, geo.label.trim() || q) : null;
  if (!w) {
    status = current ? 'ready' : 'unavailable';
    notify();
    return false;
  }
  current = w;
  status = 'ready';
  storeCity(w.city);
  notify();
  return true;
}

/** Auto-detect — the browser Geolocation API, reverse-geocoded to a city. */
export async function detectSharedLocation(): Promise<boolean> {
  status = 'loading';
  notify();
  try {
    const pos = await getPosition();
    const [city, w] = await Promise.all([
      reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude),
      fetchWeatherAt(pos.coords.latitude, pos.coords.longitude, ''),
    ]);
    if (w) {
      current = { ...w, city: city || 'Your location' };
      status = 'ready';
      if (city) storeCity(city);
      notify();
      return true;
    }
  } catch { /* permission denied or unavailable — fall through */ }
  status = current ? 'ready' : 'unavailable';
  notify();
  return false;
}

/** A surface that resolved weather itself (style-today's full flow) pushes
 * its reading into the shared state so every display stays in step. Humidity
 * and apparent temperature are optional — feels-like is derived from
 * whatever the caller has. */
export function adoptSharedWeather(
  w: Omit<SharedWeather, 'fetchedAt' | 'humidity' | 'apparentC' | 'feelsLike'> &
    Partial<Pick<SharedWeather, 'humidity' | 'apparentC' | 'feelsLike'>>,
): void {
  const humidity = w.humidity ?? null;
  const apparentC = w.apparentC ?? null;
  current = {
    ...w,
    humidity,
    apparentC,
    feelsLike: w.feelsLike ?? feelsLikeC({ tempC: w.tempC, apparentC, humidity, windKmh: w.windKmh }),
    fetchedAt: Date.now(),
  };
  status = 'ready';
  if (w.city) storeCity(w.city);
  notify();
}

/**
 * The one resolution path: stored city first (no permission re-prompt),
 * then the device GPS (the first-use browser prompt), then the profile's
 * home city when given. Fresh readings are never re-fetched.
 */
export function ensureSharedWeather(fallbackCity?: string | null): void {
  if (current && Date.now() - current.fetchedAt < FRESH_MS) return;
  if (status === 'loading') return;
  if (ensureStarted && status === 'unavailable') return; // asked once — the manual input takes it from here
  ensureStarted = true;
  void (async () => {
    const stored = getStoredSharedCity();
    if (stored && (await setSharedCity(stored))) return;
    if (await detectSharedLocation()) return;
    if (fallbackCity) await setSharedCity(fallbackCity);
  })();
}

/**
 * One compact context line for Beau's outfit reasoning (Part 3.4). It leads
 * with the FEELS-LIKE figure when it differs from the raw reading, because
 * that is the number the candidate filter used — the rationale and the
 * shortlist must be reasoning about the same day.
 */
export function sharedWeatherPromptLine(): string | null {
  if (!current) return null;
  const feels =
    current.feelsLike != null && Math.abs(current.feelsLike - current.tempC) >= 2
      ? ` — FEELS LIKE ${current.feelsLike}°C${current.humidity != null ? ` at ${current.humidity}% humidity` : ''}`
      : current.humidity != null
        ? `, ${current.humidity}% humidity`
        : '';
  return `WEATHER TODAY in ${current.city}: ${current.tempC}°C now (${current.minC}–${current.maxC}°C)${feels}, ${current.label.toLowerCase()}, ${current.precipProb}% chance of rain, wind ${current.windKmh} km/h.`;
}

/**
 * THE filtering temperature for every weather gate: feels-like when the
 * reading has one, the raw temperature otherwise, null when there is no
 * reading at all (in which case nothing is filtered).
 */
export function sharedFilterTempC(): number | null {
  if (!current) return null;
  return current.feelsLike ?? current.tempC ?? null;
}

/** Whether today genuinely calls for rain protection — the one exception the
 * warmth filter makes for heavy weatherproof outerwear. */
export function sharedWeatherIsWet(): boolean {
  if (!current) return false;
  return current.precipProb >= 50 || /rain|shower|snow|thunder/i.test(current.label);
}

export function useSharedWeather(): { weather: SharedWeather | null; status: WeatherStatus } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(WEATHER_EVENT, onChange);
    return () => window.removeEventListener(WEATHER_EVENT, onChange);
  }, []);
  return { weather: current, status };
}

// ---------------------------------------------------------------------------
// WeatherLine — the small shared display: "Barcelona · 28°C · Clear · Change
// location", with the inline city editor. tone='dark' sits on the walnut
// band; tone='light' on the standard oatmeal/paper grounds.
// ---------------------------------------------------------------------------

export function WeatherLine({ tone = 'light' }: { tone?: 'dark' | 'light' }) {
  const { weather, status: st } = useSharedWeather();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dark = tone === 'dark';
  const baseColor = dark ? '#f6f0e5' : 'var(--color-text,#241a12)';
  const mutedColor = dark ? 'rgba(246,240,229,0.72)' : 'var(--color-neutral-600,#856c51)';
  const linkColor = 'var(--color-accent,#a8712c)';
  const hairline = dark ? '1px solid rgba(246,240,229,0.35)' : '1px solid var(--color-divider,rgba(59,43,29,0.18))';

  const applyCity = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await setSharedCity(draft);
    setBusy(false);
    if (ok) setEditing(false);
    else setError(`Couldn\u2019t find \u201c${draft.trim()}\u201d — check the spelling and try again.`);
  };

  const applyDetect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await detectSharedLocation();
    setBusy(false);
    if (ok) setEditing(false);
    else setError('Couldn\u2019t read your device location — type a city instead.');
  };

  if (editing) {
    return (
      <span className="block" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: baseColor }}>
        <span className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void applyCity();
            }}
            placeholder="e.g. Barcelona"
            aria-label="Your location"
            autoFocus
            disabled={busy}
            className="px-2.5 min-h-[38px] min-w-[10rem] flex-1 focus:outline-none disabled:opacity-50"
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '13px',
              borderRadius: 0,
              border: hairline,
              background: dark ? 'transparent' : 'var(--color-paper,#fbf8f1)',
              color: baseColor,
              maxWidth: '220px',
            }}
          />
          <button
            type="button"
            onClick={() => void applyCity()}
            disabled={busy}
            className="min-h-[38px] px-2.5 inline-flex items-center gap-1.5 hover:underline disabled:opacity-50"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: linkColor, background: 'transparent', border: 'none' }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Use this city
          </button>
          <button
            type="button"
            onClick={() => void applyDetect()}
            disabled={busy}
            className="min-h-[38px] px-2 inline-flex items-center gap-1 hover:underline disabled:opacity-50"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: mutedColor, background: 'transparent', border: 'none' }}
            title="Detect my location"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            Detect
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
            aria-label="Close the location editor"
            className="min-h-[38px] w-8 inline-flex items-center justify-center hover:opacity-70 disabled:opacity-50"
            style={{ color: mutedColor, background: 'transparent', border: 'none' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
        {error && (
          <span className="block mt-1" style={{ fontSize: '12px', color: mutedColor }}>
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 flex-wrap"
      style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: baseColor }}
      aria-live="polite"
    >
      <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mutedColor }} aria-hidden="true" />
      {st === 'loading' ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: mutedColor }} />
          <span style={{ color: mutedColor }}>Reading today’s weather…</span>
        </>
      ) : weather ? (
        <>
          <span>
            {weather.city} · {weather.tempC}°C · {weather.label}
            {weather.feelsLike != null && Math.abs(weather.feelsLike - weather.tempC) >= 2
              ? ` · feels like ${weather.feelsLike}°C`
              : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraft(weather.city);
              setEditing(true);
              setError(null);
            }}
            className="hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: linkColor, background: 'transparent', border: 'none' }}
            aria-label="Change your location"
          >
            · Change location
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(getStoredSharedCity() || '');
            setEditing(true);
            setError(null);
          }}
          className="hover:underline"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: linkColor, background: 'transparent', border: 'none' }}
        >
          Set your location — Beau checks the weather
        </button>
      )}
    </span>
  );
}
