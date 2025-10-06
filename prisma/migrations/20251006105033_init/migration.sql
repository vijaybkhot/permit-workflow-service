-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('REQUIRED', 'WARNING');

-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('DRAFT', 'VALIDATED', 'PACKET_READY', 'SUBMITTED', 'POLLING', 'APPROVED', 'NEEDS_INFO');

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitSubmission" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "state" "SubmissionState" NOT NULL DEFAULT 'DRAFT',
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermitSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleSet_jurisdictionId_version_key" ON "RuleSet"("jurisdictionId", "version");

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResult" ADD CONSTRAINT "RuleResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PermitSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
