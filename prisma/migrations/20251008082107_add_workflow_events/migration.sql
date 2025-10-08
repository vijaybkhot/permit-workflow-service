-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PermitSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
