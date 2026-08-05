/**
 * Ethaion discovery-log AI helpers — the engine behind the Saved tab.
 *
 * Four intake paths, all through platform integration endpoints (no SDKs, no
 * keys in the browser):
 *  1. parseDiscoveryText — free text (“Peregrine cream rollneck — saw it at
 *     £95”) → one or more structured draft entries.
 *  2. extractFromUrl — any URL (product page, Instagram, YouTube, editorial):
 *     the page is fetched server-side (Apify cheerio scraper, falling back to
 *     web search when the page blocks scrapers), then the LLM extracts brand /
 *     name / price / category / description. Returns null when nothing could
 *     be read — the UI then asks the user to describe it instead.
 *  3. analyzeDiscoveryImage — an uploaded picture/screenshot → GPT-4 vision
 *     identification (flagged unconfident rather than silently skipped).
 *  4. parseDiscoveryDocument — CSV / Excel (.xlsx via SheetJS CDN) / PDF list
 *     of brands & items → individual draft entries.
 */

import { WARDROBE_CATEGORIES } from './profile-data';
import { uploadImageData } from './photo-enhance';

const CATEGORY_IDS = WARDROBE_CATEGORIES.map((c) => c.id);

export interface DiscoveryDraft {
  name: string;
  brand: string | null;
  category: string | null;
  price: string | null;
  description: string | null;
  /** Prefilled user-notes text (e.g. the free-text remainder). */
  notes: string | null;
  source_type: 'text' | 'url' | 'image' | 'document';
  source_url: string | null;
  image_url: string | null;
  /** False when Ethaion saw something but couldn't confidently identify it. */
  confident: boolean;
}

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = Math.min(
      ...['{', '['].map((ch) => {
        const i = trimmed.indexOf(ch);
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      }),
    );
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (Number.isFinite(start) && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cleanCategory(raw: unknown): string | null {
  const c = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return CATEGORY_IDS.includes(c) ? c : null;
}

function sanitizeDraft(raw: any, base: Partial<DiscoveryDraft>): DiscoveryDraft | null {
  const name = str(raw?.name);
  if (!name) return null;
  return {
    name,
    brand: str(raw?.brand),
    category: cleanCategory(raw?.category),
    price: str(raw?.price),
    description: str(raw?.description),
    notes: str(raw?.notes) ?? base.notes ?? null,
    source_type: base.source_type || 'text',
    source_url: base.source_url ?? null,
    image_url: base.image_url ?? null,
    confident: raw?.confident !== false,
  };
}

async function callModel(system: string, user: string, maxTokens = 1600): Promise<any> {
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error('Ethaion is unreachable right now — try again in a moment.');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? extractJson(content) : null;
}

const ENTRY_SHAPE = `Each item:
{
  "name": string,          // clean, properly capitalised display name, e.g. "Peregrine Cream Rollneck" (menswear conventions: OCBD, M-43; brands correctly spelled, e.g. "john partridge" -> "John Partridge")
  "brand": string|null,    // brand / maker if identifiable
  "category": string|null, // one of: ${CATEGORY_IDS.join(', ')} — null if unclear
  "price": string|null,    // price as seen, with currency symbol, e.g. "\u00a395" — null if not mentioned
  "description": string|null, // ONE short factual sentence about the item — null if nothing to say
  "notes": string|null     // any of the user's own commentary/opinions from the input, verbatim-ish — null if none
}`;

// ---------------------------------------------------------------------------
// 1. Free text
// ---------------------------------------------------------------------------

const TEXT_SYSTEM = `You are the intake parser for Ethaion's discovery log — a menswear "things I've seen" notebook. The user types free-form notes about brands or items they've come across. Split the text into individual entries and return STRICT JSON: {"items": [...]}.
${ENTRY_SHAPE}
Rules: one entry per distinct brand/item mentioned; keep the user's opinions in notes, facts in description; never invent items not in the text; JSON only.`;

export async function parseDiscoveryText(text: string): Promise<DiscoveryDraft[]> {
  const cleaned = text.trim();
  if (!cleaned) return [];
  try {
    const parsed = await callModel(TEXT_SYSTEM, cleaned);
    const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const drafts = rawItems
      .map((r) => sanitizeDraft(r, { source_type: 'text' }))
      .filter(Boolean) as DiscoveryDraft[];
    if (drafts.length > 0) return drafts;
  } catch (e) {
    console.warn('[Ethaion] discovery text parse failed, using raw fallback:', e);
  }
  // Fallback: keep the raw text as one entry so the input never dead-ends.
  return [
    {
      name: cleaned.length > 80 ? `${cleaned.slice(0, 80).trimEnd()}\u2026` : cleaned,
      brand: null,
      category: null,
      price: null,
      description: null,
      notes: cleaned,
      source_type: 'text',
      source_url: null,
      image_url: null,
      confident: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// 2. URL extraction — server-side fetch, graceful when pages block scrapers
// ---------------------------------------------------------------------------

const PAGE_FUNCTION = `async function pageFunction(context) {
  const { $, request } = context;
  const meta = (sel) => $(sel).attr('content') || '';
  return {
    url: request.url,
    title: $('title').first().text() || '',
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
    ogImage: meta('meta[property="og:image"]'),
    ogPrice: meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]'),
    ogPriceCurrency: meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]'),
    bodyText: $('body').text().replace(/\\s+/g, ' ').trim().slice(0, 4000),
  };
}`;

interface FetchedPage {
  title: string;
  description: string;
  image: string;
  price: string;
  bodyText: string;
}

async function fetchPageServerSide(url: string): Promise<FetchedPage | null> {
  try {
    const res = await fetch('/api/apify/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: 'apify/cheerio-scraper',
        input: {
          startUrls: [{ url }],
          pageFunction: PAGE_FUNCTION,
          maxRequestsPerCrawl: 1,
          proxyConfiguration: { useApifyProxy: true },
        },
        timeout: 2,
        parseWithGPT: false,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data?.results) ? data.results[0] : null;
    if (!row) return null;
    const title = str(row.ogTitle) || str(row.title) || '';
    const bodyText = str(row.bodyText) || '';
    if (!title && bodyText.length < 40) return null;
    // Login walls and bot pages read as page content but describe nothing.
    if (/log in|sign up to see|enable javascript|access denied|are you a robot/i.test(`${title} ${bodyText.slice(0, 300)}`) && bodyText.length < 600) {
      return null;
    }
    return {
      title,
      description: str(row.ogDescription) || '',
      image: str(row.ogImage) || '',
      price: row.ogPrice ? `${row.ogPriceCurrency || ''} ${row.ogPrice}`.trim() : '',
      bodyText,
    };
  } catch (e) {
    console.warn('[Ethaion] server-side page fetch failed:', e);
    return null;
  }
}

/** Fallback: what does the open web say about this URL? */
async function searchAboutUrl(url: string): Promise<string> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: url, searchType: 'web', num: 5 }),
    });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.results) || data.results.length === 0) return '';
    return data.results
      .map((r: any, i: number) => `${i + 1}. ${r.title || ''}\n${r.snippet || ''}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

const URL_SYSTEM = `You extract ONE structured menswear discovery-log entry from a web page the user saved. Return STRICT JSON (no markdown):
{
  "name": string|null,     // the item or, for editorial/video pages, a short descriptive label — null ONLY if the content tells you nothing about what this is
  "brand": string|null,
  "category": string|null, // one of: ${CATEGORY_IDS.join(', ')} — null if unclear
  "price": string|null,    // with currency symbol if visible
  "description": string|null // 1–2 short factual sentences: what it is, anything notable (fabric, maker, context)
}
Rules: never invent a price; correct brand capitalisation; JSON only.`;

export interface UrlExtraction {
  draft: DiscoveryDraft | null;
  /** True when the page itself couldn't be read (blocked/empty). */
  pageBlocked: boolean;
}

export async function extractFromUrl(url: string, userNote: string | null = null): Promise<UrlExtraction> {
  const page = await fetchPageServerSide(url);
  let context = '';
  if (page) {
    context = [
      `PAGE TITLE: ${page.title}`,
      page.description ? `PAGE DESCRIPTION: ${page.description}` : null,
      page.price ? `LISTED PRICE: ${page.price}` : null,
      page.bodyText ? `PAGE TEXT (truncated): ${page.bodyText.slice(0, 2500)}` : null,
    ].filter(Boolean).join('\n');
  } else {
    const searched = await searchAboutUrl(url);
    if (searched) context = `The page itself couldn't be fetched. WEB SEARCH RESULTS about the URL:\n${searched}`;
  }

  if (!context) return { draft: null, pageBlocked: true };

  try {
    const raw = await callModel(URL_SYSTEM, `URL: ${url}\n${userNote ? `USER'S NOTE: ${userNote}\n` : ''}${context}`, 500);
    const draft = sanitizeDraft(raw, {
      source_type: 'url',
      source_url: url,
      image_url: page?.image || null,
      notes: userNote,
    });
    if (!draft) return { draft: null, pageBlocked: !page };
    if (!draft.price && page?.price) draft.price = page.price;
    return { draft, pageBlocked: false };
  } catch (e) {
    console.warn('[Ethaion] URL extraction failed:', e);
    return { draft: null, pageBlocked: !page };
  }
}

// ---------------------------------------------------------------------------
// 3. Image upload — screenshots, saved photos
// ---------------------------------------------------------------------------

const IMAGE_PROMPT = `The user saved this picture into their menswear discovery log ("things I've seen"). It may be a product photo, a screenshot of a post, or a photo of a garment. Identify what it shows. Reply with ONLY strict JSON (no markdown):
{
  "name": string,          // best display name for the item, e.g. "Cream Shawl-Collar Cardigan" (menswear conventions: OCBD, M-43)
  "brand": string|null,    // ONLY if a brand is visible/readable (logo, watermark, caption) — never guess
  "category": string|null, // one of: ${CATEGORY_IDS.join(', ')}
  "price": string|null,    // ONLY if a price is visible in the image
  "description": string|null, // 1 short sentence: type of garment, colour, notable features
  "confident": boolean     // false if you can't confidently tell what the item is
}
If the image shows no garment or product at all, return {"name": null}.`;

export async function analyzeDiscoveryImage(file: File): Promise<{ draft: DiscoveryDraft | null; imageUrl: string }> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
  // The shared versioned upload (photo-enhance): content-hashed filename —
  // cache-busting by construction for every stored discovery image.
  const imageUrl = await uploadImageData(base64Data, file.name || 'discovery.jpg');

  let draft: DiscoveryDraft | null = null;
  try {
    const analyzeRes = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentUrl: imageUrl, analysisPrompt: IMAGE_PROMPT, documentType: 'image' }),
    });
    if (analyzeRes.ok) {
      const { analysis } = await analyzeRes.json();
      const parsed = typeof analysis === 'string' ? extractJson(analysis) : analysis;
      if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
        draft = sanitizeDraft(parsed, { source_type: 'image', image_url: imageUrl });
      }
    }
  } catch (e) {
    console.warn('[Ethaion] discovery image analysis failed:', e);
  }
  return { draft, imageUrl };
}

// ---------------------------------------------------------------------------
// 4. Document upload — CSV, Excel (.xlsx), PDF
// ---------------------------------------------------------------------------

const DOC_SYSTEM = `You convert a document the user kept (a spreadsheet or list of menswear brands/items they'd seen) into Ethaion discovery-log entries. Return STRICT JSON: {"items": [...]} — up to 60 items.
${ENTRY_SHAPE}
Rules: one entry per row/line item; skip header rows and empty rows; keep any per-row commentary in notes; never invent rows; JSON only.`;

/** Load SheetJS from its official CDN once (script tag — no bundler needed). */
async function loadSheetJS(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return w.XLSX;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('could not load the spreadsheet reader'));
    document.head.appendChild(script);
  });
  if (!w.XLSX) throw new Error('spreadsheet reader unavailable');
  return w.XLSX;
}

/** Read a CSV / TSV / TXT / Excel (.xlsx) file into plain text — shared with
 * the Wardrobe tab's list importer. PDFs are handled separately. */
export async function documentToText(file: File): Promise<string | null> {
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv') || file.type.startsWith('text/')) {
    const text = await file.text();
    return text.slice(0, 20000);
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await loadSheetJS();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const chunks: string[] = [];
    for (const sheetName of wb.SheetNames.slice(0, 3)) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      if (csv.trim()) chunks.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }
    return chunks.join('\n\n').slice(0, 20000) || null;
  }
  return null; // PDFs handled separately via analyze-document
}

export async function parseDiscoveryDocument(file: File): Promise<DiscoveryDraft[]> {
  const lower = (file.name || '').toLowerCase();

  // PDFs: upload, then let GPT-4 vision read the document natively.
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('could not read file'));
      reader.readAsDataURL(file);
    });
    let imageUrl: string;
    try {
      // The shared versioned upload (photo-enhance) — content-hashed filename.
      imageUrl = await uploadImageData(base64Data, file.name || 'list.pdf');
    } catch {
      throw new Error('That PDF didn\u2019t upload \u2014 try again, or export it as CSV.');
    }
    const analyzeRes = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentUrl: imageUrl,
        documentType: 'pdf',
        analysisPrompt: `${DOC_SYSTEM}\n\nRead the attached document and return the JSON now.`,
      }),
    });
    if (!analyzeRes.ok) throw new Error('Ethaion couldn\u2019t read that PDF \u2014 try exporting it as CSV.');
    const { analysis } = await analyzeRes.json();
    const parsed = typeof analysis === 'string' ? extractJson(analysis) : analysis;
    const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return rawItems
      .map((r) => sanitizeDraft(r, { source_type: 'document', notes: null }))
      .filter(Boolean) as DiscoveryDraft[];
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    throw new Error('Word files aren\u2019t supported yet \u2014 save it as PDF or CSV and upload that instead.');
  }

  const text = await documentToText(file);
  if (!text || !text.trim()) {
    throw new Error('Ethaion couldn\u2019t read that file \u2014 CSV, Excel (.xlsx) and PDF work best.');
  }
  const parsed = await callModel(DOC_SYSTEM, `FILE NAME: ${file.name}\n\nFILE CONTENT:\n${text}`, 3600);
  const rawItems: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
  return rawItems
    .map((r) => sanitizeDraft(r, { source_type: 'document', notes: null }))
    .filter(Boolean) as DiscoveryDraft[];
}

// ---------------------------------------------------------------------------
// Shared input helper
// ---------------------------------------------------------------------------

/** Pull the first URL out of free text; returns the link and the remaining text. */
export function splitUrl(text: string): { url: string | null; rest: string } {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return { url: null, rest: text.trim() };
  return { url: match[0], rest: text.replace(match[0], ' ').replace(/\s+/g, ' ').trim() };
}
