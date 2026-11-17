-- ---------------------------------------------------------------------------
-- 001_seed.sql
--
-- Reference data a new database needs: the shop's services, upgrades, and
-- which upgrades can be added to which service. Run once, after 000_schema.sql.
-- Matches the active catalog in the development database on 2026-11-16.
--
-- Staff accounts are NOT seeded (no password hashes in git): create them by
-- hand at launch (see the launch guide, Phase 4). With no Weekly_Hours rows,
-- the API uses the shop hours built into crud.py.
-- ---------------------------------------------------------------------------

INSERT INTO Service
    (slug, kind, name, description, price_cents, duration_minutes, is_active, display_order)
VALUES
    ('workz', 'service', 'The Workz',
     'The full service: The OG with Scissor Workz, Eyebrow Detail, and Lineworkz included.', 6000, 50, 1, 10),
    ('regular', 'service', 'The OG',
     'A custom service tailored to your style and finished with a clean lineup.', 4500, 35, 1, 20),
    ('kids', 'service', 'Kids Cutz',
     'A fresh finish for clients 12 and under.', 4000, 30, 1, 30),
    ('beard', 'service', 'Lineworkz',
     'Detailed beard shaping with crisp, defined edges.', 3500, 30, 1, 40),
    ('scissor-workz', 'upgrade', 'Scissor Workz',
     'Added scissor detailing for shape, texture, and a natural finish.', 500, 5, 1, 110),
    ('eyebrow-detail', 'upgrade', 'Eyebrow Detail',
     'A clean eyebrow finish for a sharper overall look.', 500, 5, 1, 120),
    ('lineworkz', 'upgrade', 'Lineworkz',
     'Add detailed beard shaping and a crisp line-up.', 500, 5, 1, 130);

-- Allowed combinations. The Workz takes no upgrades (they are included).
INSERT INTO Service_Upgrade_Compatibility (upgrade_id, service_id)
SELECT u.service_id, s.service_id
FROM Service u
JOIN Service s
WHERE (u.slug, s.slug) IN (
    ('scissor-workz', 'regular'),
    ('scissor-workz', 'kids'),
    ('eyebrow-detail', 'regular'),
    ('eyebrow-detail', 'kids'),
    ('eyebrow-detail', 'beard'),
    ('lineworkz', 'regular')
);
