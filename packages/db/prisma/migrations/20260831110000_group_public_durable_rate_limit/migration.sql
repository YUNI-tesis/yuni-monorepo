-- Public group rate-limit identifiers are HMACed before reaching PostgreSQL.
-- The table is intentionally unrelated to individual-avatar public sharing.
CREATE TABLE "GroupPublicRateLimitBucket" (
  "keyHash" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupPublicRateLimitBucket_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "GroupPublicRateLimitBucket_request_count_check" CHECK ("requestCount" > 0),
  CONSTRAINT "GroupPublicRateLimitBucket_window_check" CHECK ("expiresAt" > "windowStartedAt")
);

CREATE INDEX "GroupPublicRateLimitBucket_expiresAt_idx"
  ON "GroupPublicRateLimitBucket"("expiresAt");
