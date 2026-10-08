-- CreateTable
CREATE TABLE "AppFeedback" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "interviewId" INTEGER,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppFeedback_userId_idx" ON "AppFeedback"("userId");

-- AddForeignKey
ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
