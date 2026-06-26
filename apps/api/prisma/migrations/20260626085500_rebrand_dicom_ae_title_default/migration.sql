-- Rebrand: default DICOM AE title for new clinics changes from
-- DICOMCLOUD to SMARTPACS. Existing rows keep whatever value they
-- already have; this only affects the column's default for future inserts.
ALTER TABLE "clinics" ALTER COLUMN "dicomAeTitle" SET DEFAULT 'SMARTPACS';
