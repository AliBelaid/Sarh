-- =========================================================================
-- 016_seed_regions.sql — Libyan administrative regions (Shabiyah codes)
--
-- We bind regions.id to the Shabiyah code (e.g. id=11 → Tripoli) via
-- SET IDENTITY_INSERT, so every consumer that uses region_id=11 gets the
-- region the code refers to in real-world Libyan administration —
-- regardless of insertion order. Without this, the auto-IDENTITY would
-- assign 1..15 in MERGE order, decoupling region_id from the Shabiyah code.
-- =========================================================================
USE [sarh];
GO

SET IDENTITY_INSERT regions ON;
GO

;WITH src(id, code, name_ar, name_en) AS (
    SELECT * FROM (VALUES
        (11, N'11', N'طرابلس',         N'Tripoli'),
        (12, N'12', N'الجفارة',         N'Aljfara'),
        (13, N'13', N'الزاوية',         N'Az Zawiyah'),
        (14, N'14', N'النقاط الخمس',    N'Annuqat Alkhams'),
        (15, N'15', N'مصراتة',          N'Misrata'),
        (16, N'16', N'المرقب',          N'Almurqub'),
        (21, N'21', N'بنغازي',          N'Benghazi'),
        (22, N'22', N'الجبل الأخضر',    N'Aljabal Alakhdar'),
        (23, N'23', N'المرج',           N'Almarj'),
        (24, N'24', N'درنة',            N'Derna'),
        (25, N'25', N'طبرق',            N'Tobruk'),
        (31, N'31', N'سبها',            N'Sabha'),
        (32, N'32', N'مرزق',            N'Murzuq'),
        (33, N'33', N'وادي الحياة',     N'Wadi Alhayaa'),
        (34, N'34', N'غات',             N'Ghat')
    ) AS v(id, code, name_ar, name_en)
)
MERGE regions AS tgt
USING src AS s
   ON tgt.code = s.code
WHEN NOT MATCHED THEN
    INSERT (id, code, name_ar, name_en) VALUES (s.id, s.code, s.name_ar, s.name_en);
GO

SET IDENTITY_INSERT regions OFF;
GO
