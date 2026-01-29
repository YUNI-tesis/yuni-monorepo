-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "summary" JSONB,
ADD COLUMN     "summaryError" TEXT,
ADD COLUMN     "summaryStatus" "DocumentStatus";
