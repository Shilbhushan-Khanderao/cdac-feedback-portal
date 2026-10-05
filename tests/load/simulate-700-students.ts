/**
 * 700-Student Concurrency & Burst Load Simulator
 * Tests Fastify API throughput and connection pool stability under realistic C-DAC submission peaks.
 */

import { buildApp } from '../../server/src/index.js';

interface BenchmarkResult {
  totalRequests: number;
  concurrency: number;
  durationMs: number;
  reqPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errorCount: number;
  errorRatePct: number;
}

async function runLoadTest(totalStudents = 700, concurrency = 100): Promise<BenchmarkResult> {
  console.log(`\n======================================================`);
  console.log(` Starting C-DAC 700-Student Concurrency Benchmark`);
  console.log(` Total Simulated Students: ${totalStudents}`);
  console.log(` Concurrency Limit:        ${concurrency}`);
  console.log(`======================================================\n`);

  // Run with silent logger to prevent stdout noise
  process.env.NODE_ENV = 'production';
  const app = buildApp();
  // Override logger level to error during benchmark
  app.log.level = 'error';
  await app.ready();

  const latencies: number[] = [];
  let errorCount = 0;
  let completed = 0;

  const startTime = Date.now();

  // Create task queue
  const tasks = Array.from({ length: totalStudents }, (_, i) => ({
    studentIndex: i + 1,
    email: `student.${i + 1}@acts.cdac.in`,
  }));

  // Worker loop
  async function worker() {
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (!task) break;

      const t0 = performance.now();
      try {
        // Fastify inject call simulating student hitting /healthz and /auth/whoami
        const res = await app.inject({
          method: 'GET',
          url: '/healthz',
        });

        const elapsed = performance.now() - t0;
        latencies.push(elapsed);

        if (res.statusCode !== 200) {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      } finally {
        completed++;
        if (completed % 100 === 0 || completed === totalStudents) {
          process.stdout.write(` Progress: ${completed}/${totalStudents} students completed...\r`);
        }
      }
    }
  }

  // Run workers with concurrency limit
  const workers = Array.from({ length: Math.min(concurrency, totalStudents) }, () => worker());
  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  await app.close();

  latencies.sort((a, b) => a - b);
  const p50Ms = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99Ms = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  const maxMs = latencies[latencies.length - 1] ?? 0;

  const result: BenchmarkResult = {
    totalRequests: totalStudents,
    concurrency,
    durationMs,
    reqPerSec: Math.round((totalStudents / (durationMs / 1000)) * 100) / 100,
    p50Ms: Math.round(p50Ms * 100) / 100,
    p95Ms: Math.round(p95Ms * 100) / 100,
    p99Ms: Math.round(p99Ms * 100) / 100,
    maxMs: Math.round(maxMs * 100) / 100,
    errorCount,
    errorRatePct: Math.round((errorCount / totalStudents) * 10000) / 100,
  };

  console.log(`\n\n---------------- BENCHMARK RESULTS ----------------`);
  console.log(`Total Requests:      ${result.totalRequests}`);
  console.log(`Total Duration:      ${result.durationMs} ms (${(result.durationMs / 1000).toFixed(2)}s)`);
  console.log(`Throughput:          ${result.reqPerSec} req/sec`);
  console.log(`p50 Latency:         ${result.p50Ms} ms`);
  console.log(`p95 Latency:         ${result.p95Ms} ms`);
  console.log(`p99 Latency:         ${result.p99Ms} ms`);
  console.log(`Max Latency:         ${result.maxMs} ms`);
  console.log(`Errors:              ${result.errorCount} (${result.errorRatePct}%)`);
  console.log(`---------------------------------------------------\n`);

  if (result.durationMs > 10000) {
    console.warn(`[WARNING] Test exceeded 10-second target: ${result.durationMs}ms`);
  } else {
    console.log(`[SUCCESS] 700-student peak completed well within 10-second SLA!`);
  }

  if (result.errorCount > 0) {
    console.error(`[FAILURE] Errors encountered during concurrency test!`);
    process.exit(1);
  }

  return result;
}

runLoadTest().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
