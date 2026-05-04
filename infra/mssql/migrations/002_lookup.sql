-- =========================================================================
-- 002_lookup.sql — Libyan regions and municipalities
-- =========================================================================
USE [sijilli];
GO

CREATE TABLE regions (
    id        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    code      NVARCHAR(4)  NOT NULL UNIQUE,
    name_ar   NVARCHAR(64) NOT NULL,
    name_en   NVARCHAR(64) NOT NULL,
    geometry  geography     NULL
);
GO

CREATE TABLE municipalities (
    id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    region_id  INT           NOT NULL REFERENCES regions(id),
    code       NVARCHAR(8)   NOT NULL UNIQUE,
    name_ar    NVARCHAR(96)  NOT NULL,
    name_en    NVARCHAR(96)  NOT NULL,
    geometry   geography     NULL
);
GO
