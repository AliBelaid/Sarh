-- =========================================================================
-- 016_seed_regions.sql — Libyan administrative regions (Shabiyah codes)
-- =========================================================================
USE [sijilli];
GO

;WITH src(code, name_ar, name_en) AS (
    SELECT * FROM (VALUES
        (N'11', N'طرابلس',         N'Tripoli'),
        (N'12', N'الجفارة',         N'Aljfara'),
        (N'13', N'الزاوية',         N'Az Zawiyah'),
        (N'14', N'النقاط الخمس',    N'Annuqat Alkhams'),
        (N'15', N'مصراتة',          N'Misrata'),
        (N'16', N'المرقب',          N'Almurqub'),
        (N'21', N'بنغازي',          N'Benghazi'),
        (N'22', N'الجبل الأخضر',    N'Aljabal Alakhdar'),
        (N'23', N'المرج',           N'Almarj'),
        (N'24', N'درنة',            N'Derna'),
        (N'25', N'طبرق',            N'Tobruk'),
        (N'31', N'سبها',            N'Sabha'),
        (N'32', N'مرزق',            N'Murzuq'),
        (N'33', N'وادي الحياة',     N'Wadi Alhayaa'),
        (N'34', N'غات',             N'Ghat')
    ) AS v(code, name_ar, name_en)
)
MERGE regions AS tgt
USING src AS s
   ON tgt.code = s.code
WHEN NOT MATCHED THEN
    INSERT (code, name_ar, name_en) VALUES (s.code, s.name_ar, s.name_en);
GO
