-- =========================================================================
-- 016_seed_regions.sql — Libyan administrative regions (Shabiyah codes)
-- =========================================================================

INSERT INTO regions (code, name_ar, name_en) VALUES
    ('11', 'طرابلس',         'Tripoli'),
    ('12', 'الجفارة',         'Aljfara'),
    ('13', 'الزاوية',         'Az Zawiyah'),
    ('14', 'النقاط الخمس',    'Annuqat Alkhams'),
    ('15', 'مصراتة',          'Misrata'),
    ('16', 'المرقب',          'Almurqub'),
    ('21', 'بنغازي',          'Benghazi'),
    ('22', 'الجبل الأخضر',    'Aljabal Alakhdar'),
    ('23', 'المرج',           'Almarj'),
    ('24', 'درنة',            'Derna'),
    ('25', 'طبرق',            'Tobruk'),
    ('31', 'سبها',            'Sabha'),
    ('32', 'مرزق',            'Murzuq'),
    ('33', 'وادي الحياة',     'Wadi Alhayaa'),
    ('34', 'غات',             'Ghat')
ON CONFLICT DO NOTHING;
