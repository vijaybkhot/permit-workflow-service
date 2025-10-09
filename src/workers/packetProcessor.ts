import { Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import nunjucks from "nunjucks";
import path from "path";
import fs from "fs/promises";

const prisma = new PrismaClient();
nunjucks.configure("templates", { autoescape: true });

export const processor = async (job: Job) => {
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
  }
};
