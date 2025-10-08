-- CreateTable
CREATE TABLE "Packet" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Packet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Packet_submissionId_key" ON "Packet"("submissionId");

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PermitSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
