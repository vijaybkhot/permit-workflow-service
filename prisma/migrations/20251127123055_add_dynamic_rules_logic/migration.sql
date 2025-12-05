/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Jurisdiction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Jurisdiction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jurisdictionId` to the `PermitSubmission` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Jurisdiction" ADD COLUMN     "code" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PermitSubmission" ADD COLUMN     "jurisdictionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_code_key" ON "Jurisdiction"("code");

-- AddForeignKey
ALTER TABLE "PermitSubmission" ADD CONSTRAINT "PermitSubmission_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
