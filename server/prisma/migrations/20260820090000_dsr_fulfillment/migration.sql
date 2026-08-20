-- AlterTable
ALTER TABLE "data_subject_requests" ADD COLUMN "response_payload" JSONB,
ADD COLUMN "resolution_notes" TEXT;
