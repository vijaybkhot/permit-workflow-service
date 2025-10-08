import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import nunjucks from "nunjucks";
import path from "path";
import fs from "fs/promises";

const prisma = new PrismaClient();

const redisConnection = {
  host: "localhost",
  port: 6379,
};

// Configure Nunjucks
nunjucks.configure("templates", { autoescape: true });

console.log("🚀 Packet worker started. Waiting for jobs...");

const worker = new Worker(
  "packet-generation",
  async (job: Job) => {
    const { submissionId } = job.data;
    console.log(`Processing job ${job.id} for submission: ${submissionId}`);

    try {
      // 1. Fetch data from the database
      const submission = await prisma.permitSubmission.findUniqueOrThrow({
        where: { id: submissionId },
        include: { ruleResults: true },
      });

      // 2. Render the HTML template with Nunjucks
      const html = nunjucks.render("packet.njk", {
        submission,
        generationDate: new Date().toLocaleDateString(),
      });

      // 3. Generate the PDF with Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();

      // 4. Save the PDF to the file system
      const pdfPath = path.join(
        process.cwd(),
        "storage",
        "packets",
        `${submission.id}.pdf`
      );
      await fs.writeFile(pdfPath, pdfBuffer);
      const stats = await fs.stat(pdfPath);

      // 5. Save a record to the Packet table
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
      // throw the error to inform BullMQ the job failed
      throw error;
    }
  },
  { connection: redisConnection }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} has completed!`);
});
worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
