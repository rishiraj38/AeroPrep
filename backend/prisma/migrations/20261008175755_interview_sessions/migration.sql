-- AlterTable
ALTER TABLE "CodingChallenge" ADD COLUMN     "result" JSONB,
ADD COLUMN     "runs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "inputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resumeText" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "interviewLimit" INTEGER;

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "interviewId" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_interviewId_idx" ON "Message"("interviewId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Interviews completed before this migration were started and finished, so they
-- count against the owner's interview limit like any other
UPDATE "Interview" SET "startedAt" = "createdAt", "endedAt" = "updatedAt" WHERE "status" = 'completed';
