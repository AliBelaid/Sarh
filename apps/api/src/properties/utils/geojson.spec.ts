import { validateGeoJsonPolygon, describeGeoJsonError } from './geojson';

// A small valid triangular parcel inside Tripoli (~13.18°E, 32.88°N).
const TRIPOLI_TRIANGLE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [13.180, 32.880],
      [13.181, 32.880],
      [13.180, 32.881],
      [13.180, 32.880],
    ],
  ],
};

describe('validateGeoJsonPolygon()', () => {
  it('accepts a small closed triangle in Tripoli', () => {
    const r = validateGeoJsonPolygon(TRIPOLI_TRIANGLE);
    expect(r.ok).toBe(true);
  });

  it('rejects a non-Polygon type', () => {
    const r = validateGeoJsonPolygon({ type: 'Point', coordinates: [13.18, 32.88] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_polygon');
  });

  it('rejects when coordinates is missing', () => {
    const r = validateGeoJsonPolygon({ type: 'Polygon' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_outer_ring');
  });

  it('rejects a 3-point ring (need ≥4 incl. closing point)', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [[[13.18, 32.88], [13.181, 32.88], [13.18, 32.881]]],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too_few_points');
  });

  it('rejects an unclosed ring', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [
        [
          [13.180, 32.880],
          [13.181, 32.880],
          [13.180, 32.881],
          [13.180, 32.882], // ≠ first
        ],
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_closed');
  });

  it('rejects coordinates that are not numeric', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [
        [
          [13.180, 32.880],
          ['x', 32.880],
          [13.180, 32.881],
          [13.180, 32.880],
        ],
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_coordinate');
  });

  it('rejects NaN / Infinity coordinates', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [
        [
          [13.180, 32.880],
          [Number.NaN, 32.880],
          [13.180, 32.881],
          [13.180, 32.880],
        ],
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_coordinate');
  });

  it('rejects swapped lat/lng (Tripoli has lat ~33, lng ~13 — swapped puts lat ~13)', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [
        [
          [32.880, 13.180],
          [32.881, 13.180],
          [32.880, 13.181],
          [32.880, 13.180],
        ],
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('out_of_libya');
  });

  it('rejects a parcel in Tunisia (lng ~10, lat ~36 — north of border)', () => {
    const r = validateGeoJsonPolygon({
      type: 'Polygon',
      coordinates: [
        [
          [10.5, 36.5],
          [10.6, 36.5],
          [10.5, 36.6],
          [10.5, 36.5],
        ],
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('out_of_libya');
  });
});

describe('describeGeoJsonError()', () => {
  it('returns Arabic + English messages for every error code', () => {
    const codes = [
      { code: 'not_polygon', got: 'Point' } as const,
      { code: 'no_outer_ring' } as const,
      { code: 'too_few_points', n: 2 } as const,
      { code: 'not_closed' } as const,
      { code: 'invalid_coordinate', index: 1, coord: ['x', 0] } as const,
      { code: 'out_of_libya', index: 0, coord: [0, 0] as [number, number] } as const,
      { code: 'self_intersecting' } as const,
    ];
    for (const c of codes) {
      const m = describeGeoJsonError(c);
      expect(m.message_ar.length).toBeGreaterThan(0);
      expect(m.message_en.length).toBeGreaterThan(0);
    }
  });
});
