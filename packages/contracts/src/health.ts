import { z } from 'zod';

export const HealthCheckResultSchema = z.object({
  status: z.enum(['pass', 'fail']),
  latencyMs: z.number().nonnegative().optional(),
  /** Short, non-sensitive explanation. Omitted in production for failed checks. */
  detail: z.string().optional(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

export const ServiceNameSchema = z.enum(['api', 'worker', 'web']);
export type ServiceName = z.infer<typeof ServiceNameSchema>;

export const HealthReportSchema = z.object({
  status: z.enum(['ok', 'error']),
  service: ServiceNameSchema,
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  checks: z.record(z.string(), HealthCheckResultSchema),
});
export type HealthReport = z.infer<typeof HealthReportSchema>;

export const LivenessSchema = z.object({
  status: z.literal('ok'),
  service: ServiceNameSchema,
});
export type Liveness = z.infer<typeof LivenessSchema>;
