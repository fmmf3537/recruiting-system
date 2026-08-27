import { afterEach, describe, expect, it, vi } from 'vitest';

const sdkStart = vi.hoisted(() => vi.fn());
const sdkShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const exporterCtor = vi.hoisted(() => vi.fn());
const mockGetSpan = vi.hoisted(() => vi.fn(() => undefined as { spanContext: () => { traceId: string; spanId: string } } | undefined));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(_config: unknown) {
      /* config inspected via exporterCtor */
    }

    start = sdkStart;

    shutdown = sdkShutdown;
  },
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class {
    constructor(opts: { url: string }) {
      exporterCtor(opts);
    }

    export(): void {
      /* no-op */
    }

    shutdown(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: () => [],
}));

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getSpan: mockGetSpan,
    },
  };
});

describe('tracing.ts 启动门闩', () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  afterEach(() => {
    if (originalEndpoint === undefined) {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    } else {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    }
    vi.resetModules();
    sdkStart.mockClear();
    exporterCtor.mockClear();
  });

  it('未设置 OTEL_EXPORTER_OTLP_ENDPOINT 时加载 tracing.ts 不报错、不启动 SDK', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    vi.resetModules();

    await expect(import('../../src/lib/tracing.ts')).resolves.toBeDefined();
    expect(exporterCtor).not.toHaveBeenCalled();
    expect(sdkStart).not.toHaveBeenCalled();
  });

  it('设置 OTEL_EXPORTER_OTLP_ENDPOINT 时实例化 OTLP exporter', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    vi.resetModules();

    await import('../../src/lib/tracing.ts');

    expect(exporterCtor).toHaveBeenCalledWith({ url: 'http://localhost:4318/v1/traces' });
    expect(sdkStart).toHaveBeenCalledTimes(1);
  });
});

describe('pino logger mixin 与 span', () => {
  afterEach(() => {
    mockGetSpan.mockReturnValue(undefined);
  });

  it('有 active span 时 mixin 包含 trace_id 和 span_id', async () => {
    mockGetSpan.mockReturnValue({
      spanContext: () => ({
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spanId: 'bbbbbbbbbbbbbbbb',
      }),
    });
    const { traceLogMixin } = await import('../../src/lib/logger.ts');
    expect(traceLogMixin()).toEqual({
      trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      span_id: 'bbbbbbbbbbbbbbbb',
    });
  });

  it('无 span context 时 mixin 返回空对象', async () => {
    mockGetSpan.mockReturnValue(undefined);
    const { traceLogMixin } = await import('../../src/lib/logger.ts');
    expect(traceLogMixin()).toEqual({});
  });

  it('trace_id 不走 pino redact，且不会挡住 PII 脱敏', async () => {
    mockGetSpan.mockReturnValue({
      spanContext: () => ({
        traceId: 'cccccccccccccccccccccccccccccccc',
        spanId: 'dddddddddddddddd',
      }),
    });
    const { Writable } = await import('node:stream');
    const { createLogger } = await import('../../src/lib/logger.ts');

    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const log = createLogger(stream);
    log.info({ phone: '13900001111' }, 'traced');

    expect(output).toContain('cccccccccccccccccccccccccccccccc');
    expect(output).toContain('trace_id');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('13900001111');
  });
});
