import { z } from 'zod';
import type { PromptModule } from '../../tasks.js';

/**
 * `system.selftest` v1: a fixed health prompt that proves the whole path (routing, provider,
 * structured output, validation, metering) without any customer data. Inputs are generated
 * values only: a random code and two small integers.
 */
const contextSchema = z.strictObject({
  code: z.string().regex(/^[A-Z0-9]{6,12}$/),
  a: z.number().int().min(0).max(1000),
  b: z.number().int().min(0).max(1000),
});
type Vars = z.infer<typeof contextSchema>;

const outputSchema = z.strictObject({
  status: z.literal('ok'),
  echo: z.string().max(20),
  sum: z.number().int(),
});
type Out = z.infer<typeof outputSchema>;

export const systemSelftestV1: PromptModule<Vars, Out> = {
  task: 'system.selftest',
  version: 1,
  system: [
    'You are a health check for an API integration.',
    'Reply with a JSON object only, matching the provided schema:',
    '- "status": the string "ok"',
    '- "echo": the code you were given, unchanged',
    '- "sum": the sum of the two integers you were given',
  ].join('\n'),
  contextSchema,
  buildUser: (vars) => [
    { kind: 'task', text: `Code: ${vars.code}\nIntegers: ${vars.a} and ${vars.b}` },
  ],
  outputSchema,
  fakeOutput: (vars) => ({ status: 'ok', echo: vars.code, sum: vars.a + vars.b }),
  score: (vars, out) => {
    if (out.echo !== vars.code) return { pass: false, detail: 'echo mismatch' };
    if (out.sum !== vars.a + vars.b) return { pass: false, detail: 'wrong sum' };
    return { pass: true };
  },
};
