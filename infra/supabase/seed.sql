-- =========================================================================
-- seed.sql — local development seed data
-- Loaded automatically by `supabase db reset`. Production should NOT use this.
-- =========================================================================

-- A handful of municipalities for the largest regions, just enough for
-- end-to-end happy-path testing of the citizen + officer flows.
INSERT INTO municipalities (region_id, code, name_ar, name_en) VALUES
    ((SELECT id FROM regions WHERE code = '11'), '11-01', 'مركز طرابلس',  'Tripoli Center'),
    ((SELECT id FROM regions WHERE code = '11'), '11-02', 'تاجوراء',       'Tajoura'),
    ((SELECT id FROM regions WHERE code = '11'), '11-03', 'سوق الجمعة',    'Souq Aljumaa'),
    ((SELECT id FROM regions WHERE code = '21'), '21-01', 'مركز بنغازي',   'Benghazi Center'),
    ((SELECT id FROM regions WHERE code = '21'), '21-02', 'سيدي حسين',     'Sidi Hussein'),
    ((SELECT id FROM regions WHERE code = '15'), '15-01', 'مركز مصراتة',   'Misrata Center')
ON CONFLICT DO NOTHING;
