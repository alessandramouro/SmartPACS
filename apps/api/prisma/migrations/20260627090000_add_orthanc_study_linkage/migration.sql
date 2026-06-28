-- Links a Study to its copy in the central cloud Orthanc archive, so the
-- web app knows whether a study can be opened in the OHIF viewer.
ALTER TABLE "studies" ADD COLUMN "orthancStudyId" VARCHAR(64);
ALTER TABLE "studies" ADD COLUMN "orthancStoredAt" TIMESTAMP(3);
