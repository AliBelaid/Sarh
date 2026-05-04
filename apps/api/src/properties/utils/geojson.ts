// Pure GeoJSON helpers for property submissions.
// PostGIS does the heavy geometry work (area, centroid, intersection);
// this module only does the lightweight syntax-level checks that we
// want to fail fast — before paying for a DB round-trip.

export interface GeoJsonPolygon {
  type: 'Polygon';
  // First sub-array is the outer ring; subsequent ones are holes.
  coordinates: [number, number][][];
}

// Generous Libya bounding box (approximate, with margin):
//   lng: 9°  → 26°  E
//   lat: 19° → 34°  N
// Coordinates outside this box are almost certainly wrong-hemisphere
// data-entry mistakes (e.g. lat/lng swapped). Sanity check only — final
// authority is the regions.geometry boundary in the lookup table.
const LIBYA_LNG_MIN = 9.0;
const LIBYA_LNG_MAX = 26.0;
const LIBYA_LAT_MIN = 19.0;
const LIBYA_LAT_MAX = 34.0;

export type GeoJsonValidationError =
  | { code: 'not_polygon'; got: unknown }
  | { code: 'no_outer_ring' }
  | { code: 'too_few_points'; n: number }
  | { code: 'not_closed' }
  | { code: 'invalid_coordinate'; index: number; coord: unknown }
  | { code: 'out_of_libya'; index: number; coord: [number, number] }
  | { code: 'self_intersecting' /* hint only — DB makes the call */ };

export function validateGeoJsonPolygon(
  input: unknown,
): { ok: true; polygon: GeoJsonPolygon } | { ok: false; error: GeoJsonValidationError } {
  if (!isObject(input) || input.type !== 'Polygon') {
    return { ok: false, error: { code: 'not_polygon', got: (input as { type?: unknown })?.type } };
  }
  const rings = (input as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(rings) || rings.length === 0 || !Array.isArray(rings[0])) {
    return { ok: false, error: { code: 'no_outer_ring' } };
  }

  const outer = rings[0] as unknown[];
  if (outer.length < 4) {
    return { ok: false, error: { code: 'too_few_points', n: outer.length } };
  }

  for (let i = 0; i < outer.length; i++) {
    const c = outer[i];
    if (
      !Array.isArray(c) ||
      c.length < 2 ||
      typeof c[0] !== 'number' ||
      typeof c[1] !== 'number' ||
      !Number.isFinite(c[0]) ||
      !Number.isFinite(c[1])
    ) {
      return { ok: false, error: { code: 'invalid_coordinate', index: i, coord: c } };
    }
    const [lng, lat] = c as [number, number];
    if (lng < LIBYA_LNG_MIN || lng > LIBYA_LNG_MAX || lat < LIBYA_LAT_MIN || lat > LIBYA_LAT_MAX) {
      return { ok: false, error: { code: 'out_of_libya', index: i, coord: [lng, lat] } };
    }
  }

  const first = outer[0] as [number, number];
  const last = outer[outer.length - 1] as [number, number];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { ok: false, error: { code: 'not_closed' } };
  }

  return {
    ok: true,
    polygon: { type: 'Polygon', coordinates: rings as [number, number][][] },
  };
}

// Translate the structured error into an Arabic + English pair suitable
// for the SijilliErrors envelope.
export function describeGeoJsonError(err: GeoJsonValidationError): {
  message_ar: string;
  message_en: string;
} {
  switch (err.code) {
    case 'not_polygon':
      return {
        message_ar: 'الإحداثيات يجب أن تكون من نوع Polygon.',
        message_en: `GeoJSON type must be Polygon, got ${String(err.got)}.`,
      };
    case 'no_outer_ring':
      return {
        message_ar: 'لا يحتوي المضلّع على حد خارجي صالح.',
        message_en: 'Polygon outer ring missing or invalid.',
      };
    case 'too_few_points':
      return {
        message_ar: `يجب أن يحتوي المضلّع على 4 نقاط على الأقل (أُرسل ${err.n}).`,
        message_en: `Polygon outer ring needs ≥4 points, got ${err.n}.`,
      };
    case 'not_closed':
      return {
        message_ar: 'حدود العقار يجب أن تكون مغلقة (نقطة البداية = نقطة النهاية).',
        message_en: 'Polygon outer ring is not closed (first ≠ last).',
      };
    case 'invalid_coordinate':
      return {
        message_ar: `إحداثي غير صالح في الموضع رقم ${err.index + 1}.`,
        message_en: `Invalid coordinate at index ${err.index}: ${JSON.stringify(err.coord)}.`,
      };
    case 'out_of_libya':
      return {
        message_ar: `الإحداثيات (${err.coord[0]}, ${err.coord[1]}) خارج حدود ليبيا التقريبية.`,
        message_en: `Coordinate (${err.coord[0]}, ${err.coord[1]}) is outside Libya bounding box.`,
      };
    case 'self_intersecting':
      return {
        message_ar: 'حدود العقار متقاطعة مع نفسها.',
        message_en: 'Polygon outer ring is self-intersecting.',
      };
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
