import type { NodeSDK } from '@opentelemetry/sdk-node';
import dotenv from 'dotenv';

// --import 早于 index.ts，需自行加载 .env
dotenv.config();

function parseSamplingRatio(): number {
  const raw = process.env.OTEL_SAMPLING_RATIO;
  const n = raw ? Number.parseFloat(raw) : 1;
  if (!Number.isFinite(n) || n < 0) {
    return 1;
  }
  return Math.min(n, 1);
}

/**
 * 未配置 OTEL_EXPORTER_OTLP_ENDPOINT 时不加载 SDK、不连 OTLP（优雅降级）。
 */
export async function startTracing(): Promise<NodeSDK | null> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return null;
  }

  const [
    { NodeSDK },
    { getNodeAutoInstrumentations },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { TraceIdRatioBasedSampler },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/auto-instrumentations-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/sdk-trace-node'),
    import('@opentelemetry/semantic-conventions'),
  ]);

  const baseUrl = endpoint.replace(/\/$/, '');
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'ats-server',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${baseUrl}/v1/traces` }),
    sampler: new TraceIdRatioBasedSampler(parseSamplingRatio()),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.once('SIGTERM', () => {
    sdk.shutdown().catch((err: unknown) => {
      console.error('OpenTelemetry shutdown failed:', err);
    });
  });

  return sdk;
}

await startTracing();
