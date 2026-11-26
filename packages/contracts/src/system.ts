import { z } from 'zod';

export const SystemInfoSchema = z.object({
  name: z.string(),
  service: z.literal('api'),
  version: z.string(),
  environment: z.string(),
  apiVersion: z.literal('v1'),
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;
