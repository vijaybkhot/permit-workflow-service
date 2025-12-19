import { Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import nunjucks from "nunjucks";
import path from "path";
import fs from "fs/promises";

nunjucks.configure("templates", { autoescape: true });

export const processor = async (job: Job) => {
  const prisma = new PrismaClient();
  const { submissionId } = job.data;
  console.log(`Processing job ${job.id} for submission: ${submissionId}`);

  try {
    const submission = await prisma.permitSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { ruleResults: true },
    });

    const html = nunjucks.render("packet.njk", {
      submission,
      generationDate: new Date().toLocaleDateString(),
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    const pdfPath = path.join(
      process.cwd(),
      "storage",
      "packets",
      `${submission.id}.pdf`
    );
    await fs.writeFile(pdfPath, pdfBuffer);
    const stats = await fs.stat(pdfPath);

    await prisma.packet.create({
      data: {
        submissionId: submission.id,
        filePath: pdfPath,
        sizeBytes: stats.size,
      },
    });

    await prisma.$transaction([
      // 1. Update Submission State
      prisma.permitSubmission.update({
        where: { id: submission.id },
        data: { state: "PACKET_READY" },
      }),
      // 2. Log System Event (Audit Trail)
      prisma.workflowEvent.create({
        data: {
          submissionId: submission.id,
          eventType: "STATE_TRANSITION",
          fromState: "VALIDATED",
          toState: "PACKET_READY",
          // No userId here because the "System" did it
        },
      }),
    ]);

    console.log(
      `✅ Finished processing job ${job.id}. PDF saved to ${pdfPath}`
    );
    return { status: "complete", path: pdfPath };
  } catch (error) {
    console.error(
      `❌ Job ${job.id} failed for submission ${submissionId}`,
      error
    );
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};
