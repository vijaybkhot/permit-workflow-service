import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { trace, Tracer, Span } from "@opentelemetry/api";

export class TracingManager {
  private static instance: TracingManager;
  private sdk: NodeSDK;
  private tracer: Tracer;
  private serviceName: string;

  private constructor() {
    this.serviceName = "permit-workflow-service";

    // 1. Configure the Exporter
    let traceExporter;
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      console.log("📡 Tracing: Using Jaeger (OTLP) Exporter");
      traceExporter = new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      });
    } else {
      console.log("💻 Tracing: Using Console Exporter");
      traceExporter = new ConsoleSpanExporter();
    }

    // 2. Initialize the SDK
    this.sdk = new NodeSDK({
      serviceName: this.serviceName,
      traceExporter: traceExporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    // 3. Create a helper Tracer for manual spans
    this.tracer = trace.getTracer(this.serviceName);

    // 4. Start the SDK (Must happen before app starts)
    this.sdk.start();

    // Handle clean shutdown
    process.on("SIGTERM", () => {
      this.sdk
        .shutdown()
        .then(() => console.log("Tracing terminated"))
        .catch((error) => console.log("Error terminating tracing", error));
    });
  }

  public static getInstance(): TracingManager {
    if (!TracingManager.instance) {
      TracingManager.instance = new TracingManager();
    }
    return TracingManager.instance;
  }

  public startSpan(name: string): Span {
    return this.tracer.startSpan(name);
  }
}

export const tracing = TracingManager.getInstance();
