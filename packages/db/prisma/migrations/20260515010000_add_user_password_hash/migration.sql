ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

UPDATE "User"
SET "passwordHash" = '$2b$10$Gp7Lpf7jYhtgKnocU9Zs2eLyiLxzG1ydQ0gFj0YMLyIslW95AD3ay'
WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
