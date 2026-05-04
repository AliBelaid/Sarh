-- =========================================================================
-- 002_lookup.sql — Libyan regions and municipalities
-- =========================================================================

CREATE TABLE regions (
    id        SERIAL PRIMARY KEY,
    code      VARCHAR(4)  NOT NULL UNIQUE,         -- 11=Tripoli, 21=Benghazi, etc.
    name_ar   VARCHAR(64) NOT NULL,
    name_en   VARCHAR(64) NOT NULL,
    geometry  GEOMETRY(MultiPolygon, 4326)
);

CREATE TABLE municipalities (
    id         SERIAL PRIMARY KEY,
    region_id  INT NOT NULL REFERENCES regions(id),
    code       VARCHAR(8)  NOT NULL UNIQUE,
    name_ar    VARCHAR(96) NOT NULL,
    name_en    VARCHAR(96) NOT NULL,
    geometry   GEOMETRY(MultiPolygon, 4326)
);
