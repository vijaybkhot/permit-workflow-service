import { Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import nunjucks from "nunjucks";
import path from "path";
import fs from "fs/promises";
import { tracing } from "../core/observability/TracingManager";
import { SpanStatusCode } from "@opentelemetry/api";

nunjucks.configure("templates", { autoescape: true });

export const processor = async (job: Job) => {
  const prisma = new PrismaClient();
  const { submissionId } = job.data;

  // 2. Start the Manual Span
  const span = tracing.startSpan("process_packet_job");

  // 3. Add Context (Tags)
  span.setAttribute("app.submission_id", submissionId);
  span.setAttribute("app.job_id", job.id || "unknown");

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
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
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
      prisma.permitSubmission.update({
        where: { id: submission.id },
        data: { state: "PACKET_READY" },
      }),
      prisma.workflowEvent.create({
        data: {
          submissionId: submission.id,
          eventType: "STATE_TRANSITION",
          fromState: "VALIDATED",
          toState: "PACKET_READY",
        },
      }),
    ]);

    console.log(`✅ Finished processing job ${job.id}.`);

    // 4. Mark Span as Success
    span.setStatus({ code: SpanStatusCode.OK });

    return { status: "complete", path: pdfPath };
  } catch (error) {
    console.error(`❌ Job ${job.id} failed`, error);

    // 5. Record the Error in the Trace
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: (error as Error).message,
    });

    throw error;
  } finally {
    // 6. CRITICAL: End the Span
    await prisma.$disconnect();
    span.end();
  }
};
