import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import nunjucks from "nunjucks";
import path from "path";
import fs from "fs/promises";
import { processor } from "./packetProcessor";

const prisma = new PrismaClient();

const redisConnection = {
  host: "localhost",
  port: 6379,
};

// Configure Nunjucks
nunjucks.configure("templates", { autoescape: true });

console.log("🚀 Packet worker started. Waiting for jobs...");

const worker = new Worker("packet-generation", processor, {
  connection: redisConnection,
});

worker.on("completed", (job) => {
  console.log(`Job ${job.id} has completed!`);
});
worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} has failed with error: ${err.message}`);
});
