// End-to-end check of the new property flow against a running API (:3001):
//   citizen logs in → uploads photo + koreky → submits a polygon property
//   → officer logs in → sees it in the pending queue → fetches it (with the
//   boundary_polygon GeoJSON + documents) → approves it.
//
// Run: node scripts/verify-e2e-property.mjs   (API must be up on :3001)

const BASE = process.env.SARH_API_BASE ?? 'http://localhost:3001/api/v1';
const out = [];
const log = (m) => { out.push(m); console.log(m); };
let failures = 0;
const check = (cond, label) => { log(`${cond ? 'PASS' : 'FAIL'} — ${label}`); if (!cond) failures++; };

async function api(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

function pngBlob() {
  // 1×1 transparent PNG.
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' });
}

async function uploadDoc(token, name) {
  const fd = new FormData();
  fd.append('file', pngBlob(), name);
  const r = await api('/uploads/property-document', { method: 'POST', token, form: fd });
  if (r.status !== 200) throw new Error(`upload ${name} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.path; // "<bucket>/<path>"
}

// A small quadrilateral inside Tripoli (region 11). Offset by a random
// amount each run so we never collide with a previously-approved parcel
// (the centroid-uniqueness rule, constraint 3, would 409 otherwise).
const ox = (Math.random() - 0.5) * 0.05; // ~±2.8 km in lng
const oy = (Math.random() - 0.5) * 0.05;
const bx = 13.19 + ox, by = 32.887 + oy;
const RING = [
  [bx, by],
  [bx + 0.0006, by],
  [bx + 0.0006, by + 0.0006],
  [bx, by + 0.0006],
  [bx, by],
];

function ringAreaSqm(ring) {
  const R = 6378137;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % ring.length];
    a += (p2[0] - p1[0]) * Math.PI / 180 *
      (2 + Math.sin(p1[1] * Math.PI / 180) + Math.sin(p2[1] * Math.PI / 180));
  }
  return Math.abs(a * R * R / 2);
}

try {
  // 1) Citizen login (Ahmed, Tripoli/region 11).
  const cit = await api('/auth/sign-in', { method: 'POST', body: { email: 'ahmed@sarh.ly', password: 'Demo!12345' } });
  check(cit.status === 200 && !!cit.data?.access_token, `citizen sign-in (status ${cit.status})`);
  const citToken = cit.data?.access_token;
  if (!citToken) throw new Error('no citizen token; aborting');

  // 2) Upload a site photo + a koreky sketch.
  const photoPath = await uploadDoc(citToken, 'site.png');
  const korekyPath = await uploadDoc(citToken, 'koreky.png');
  check(!!photoPath && !!korekyPath, 'uploaded site photo + koreky');

  // 3) Submit the property with the polygon + both documents inline.
  const area = +ringAreaSqm(RING).toFixed(2);
  const submit = await api('/properties', {
    method: 'POST', token: citToken,
    body: {
      property_type: 'residential',
      region_id: 11,
      address_ar: 'اختبار E2E — حي الأندلس',
      boundary_polygon: { type: 'Polygon', coordinates: [RING] },
      area_sqm: area,
      documents: [
        { document_type: 'site_photo', storage_path: photoPath, mime_type: 'image/png' },
        { document_type: 'koreky_certificate', storage_path: korekyPath, mime_type: 'image/png' },
      ],
    },
  });
  check(submit.status === 200, `submit property (status ${submit.status}) ${submit.status !== 200 ? JSON.stringify(submit.data) : ''}`);
  const propId = submit.data?.property?.id;
  check(!!propId, `got property id ${propId ?? '(none)'}`);
  log(`   computed_area_sqm=${submit.data?.validation?.computed_area_sqm}, claimed=${area}, diff%=${submit.data?.validation?.area_diff_pct}`);

  // 3b) Submit WITHOUT documents must be rejected (the new rule).
  const noDocs = await api('/properties', {
    method: 'POST', token: citToken,
    body: {
      property_type: 'residential', region_id: 11,
      boundary_polygon: { type: 'Polygon', coordinates: [RING] }, area_sqm: area, documents: [],
    },
  });
  check(noDocs.status >= 400, `submit without documents is rejected (status ${noDocs.status})`);

  // 4) Officer login (Tripoli/region 11).
  const off = await api('/auth/sign-in', { method: 'POST', body: { email: 'officer@sarh.ly', password: 'Demo!12345' } });
  check(off.status === 200 && !!off.data?.access_token, `officer sign-in (status ${off.status})`);
  const offToken = off.data?.access_token;
  if (!offToken) throw new Error('no officer token; aborting');

  // 5) Officer sees the new property in the pending queue.
  const queue = await api('/properties?status=pending&limit=100', { token: offToken });
  const inQueue = Array.isArray(queue.data?.items) && queue.data.items.some((p) => p.id === propId);
  check(inQueue, `property appears in officer pending queue (${queue.data?.items?.length ?? 0} items)`);

  // 6) Officer fetches it — boundary_polygon GeoJSON + documents present.
  const detail = await api(`/properties/${propId}`, { token: offToken });
  const ring = detail.data?.boundary_polygon?.coordinates?.[0];
  check(Array.isArray(ring) && ring.length >= 4, `GET property returns boundary_polygon (${ring?.length ?? 0} points)`);
  const docs = await api(`/properties/${propId}/documents`, { token: offToken });
  const docItems = docs.data?.items ?? [];
  const docTypes = docItems.map((d) => d.document_type).sort();
  check(docTypes.includes('site_photo') && docTypes.includes('koreky_certificate'),
    `documents listed: [${docTypes.join(', ')}]`);

  // 6b) Officer streams a document file (what the web review viewer renders).
  if (docItems[0]) {
    const fileRes = await fetch(`${BASE}/properties/${propId}/documents/${docItems[0].id}/file`, {
      headers: { Authorization: `Bearer ${offToken}` },
    });
    const buf = Buffer.from(await fileRes.arrayBuffer());
    check(fileRes.status === 200 && buf.length > 0,
      `document file streams (status ${fileRes.status}, ${buf.length} bytes, ${fileRes.headers.get('content-type')})`);
  }

  // 7) Officer approves.
  const review = await api(`/properties/${propId}/review`, {
    method: 'POST', token: offToken, body: { decision: 'approve', approval_decree_no: 'E2E-TEST-1' },
  });
  check(review.status === 200, `officer approve (status ${review.status}) ${review.status !== 200 ? JSON.stringify(review.data) : ''}`);
  const newStatus = review.data?.property?.status;
  check(newStatus === 'approved', `property status is now '${newStatus}'`);
} catch (e) {
  log(`ERROR: ${e.message}`);
  failures++;
}

log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
process.exit(failures === 0 ? 0 : 1);
