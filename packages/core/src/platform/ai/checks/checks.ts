import type { z } from 'zod';
import type { CheckResult } from '../types.js';

/**
 * Deterministic AI checks (15-ai-security-controls). Pure functions: no network, no LLM, no I/O.
 * Each returns a CheckResult; a BLOCK stops the pipeline and fails closed. Details never contain
 * user or model text (they land in ai_runs and logs).
 */

const pass = (id: string): CheckResult => ({ id, outcome: 'PASS' });

/** AIC-PRE-03: kill switches (global env flag, per-task routing flag). */
export function checkKillSwitch(opts: {
  globalDisabled: boolean;
  taskDisabled: boolean;
}): CheckResult {
  if (opts.globalDisabled)
    return { id: 'AIC-PRE-03', outcome: 'BLOCK', detail: 'ai.disabled (global)' };
  if (opts.taskDisabled)
    return { id: 'AIC-PRE-03', outcome: 'BLOCK', detail: 'ai.disabled (task)' };
  return pass('AIC-PRE-03');
}

/** Rough token estimate (chars / 4) used before the call. Conservative for English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * AIC-PRE-06: input size. Over budget → truncate untrusted blocks from the tail (priority rule,
 * 05 §6). If the system prompt and fixed blocks alone do not fit → BLOCK.
 */
export function fitToBudget<B extends { kind: string; text: string }>(
  system: string,
  blocks: B[],
  maxTokens: number,
): { blocks: B[]; result: CheckResult } {
  const fixed =
    estimateTokens(system) +
    blocks.filter((b) => b.kind !== 'untrusted').reduce((n, b) => n + estimateTokens(b.text), 0);
  if (fixed > maxTokens) {
    return {
      blocks,
      result: {
        id: 'AIC-PRE-06',
        outcome: 'BLOCK',
        detail: `fixed input ${fixed} > ${maxTokens} tokens`,
      },
    };
  }
  let remaining = maxTokens - fixed;
  let truncated = false;
  const out = blocks.map((b) => {
    if (b.kind !== 'untrusted') return b;
    const tokens = estimateTokens(b.text);
    if (tokens <= remaining) {
      remaining -= tokens;
      return b;
    }
    truncated = true;
    const keepChars = Math.max(0, remaining * 4);
    remaining = 0;
    return { ...b, text: b.text.slice(0, keepChars) };
  });
  return {
    blocks: out,
    result: truncated
      ? { id: 'AIC-PRE-06', outcome: 'WARN', detail: 'untrusted input truncated to fit' }
      : pass('AIC-PRE-06'),
  };
}

/**
 * AIC-PRE-07: tenancy assertion on the assembled context. Every entity carrying a workspaceId must
 * belong to the call's workspace (asserted, not assumed).
 */
export function checkTenancy(scopeWorkspaceId: string | null, context: unknown): CheckResult {
  const foreign: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if ('workspaceId' in record && record.workspaceId !== scopeWorkspaceId)
      foreign.push(String(record.workspaceId));
    for (const child of Object.values(record)) walk(child, depth + 1);
  };
  walk(context, 0);
  return foreign.length
    ? {
        id: 'AIC-PRE-07',
        outcome: 'BLOCK',
        detail: `${foreign.length} entity(ies) from another workspace`,
      }
    : pass('AIC-PRE-07');
}

/** AIC-PRE-09: injection heuristics on untrusted text. Detection only: tightens the action gate. */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i,
  /\bdisregard\s+(all\s+|the\s+)?(previous|prior|above)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\b(send|forward|email|bcc)\b.{0,40}\bto\b.{0,60}@/i,
  /\bact\s+as\s+(an?\s+)?(admin|administrator|system|developer)\b/i,
  /[A-Za-z0-9+/]{200,}={0,2}/, // long base64 blobs
  /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)/i, // hidden-text CSS from crawl
];

export function detectInjection(texts: string[]): CheckResult & { suspected: boolean } {
  const hits = INJECTION_PATTERNS.filter((pattern) => texts.some((t) => pattern.test(t))).length;
  return hits > 0
    ? { id: 'AIC-PRE-09', outcome: 'WARN', detail: `${hits} injection pattern(s)`, suspected: true }
    : { ...pass('AIC-PRE-09'), suspected: false };
}

/** AIC-PRE-10: the context holds only the task's allowlisted fields (strict schema). */
export function checkContextSchema<V>(
  schema: z.ZodType<V>,
  context: unknown,
): { result: CheckResult; data?: V } {
  const parsed = schema.safeParse(context);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.') || i.code).slice(0, 5);
    return {
      result: {
        id: 'AIC-PRE-10',
        outcome: 'BLOCK',
        detail: `context rejected: ${fields.join(', ')}`,
      },
    };
  }
  return { result: pass('AIC-PRE-10'), data: parsed.data };
}

/** AIC-PRE-11: no secrets in the assembled prompt. */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /\bv[1-9]\d*:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:/, // FieldCrypto ciphertext
  /\b(password|passwd|api[_-]?key|secret)\s*[=:]\s*\S{6,}/i,
];

export function checkSecrets(prompt: string): CheckResult {
  const hit = SECRET_PATTERNS.some((pattern) => pattern.test(prompt));
  return hit
    ? { id: 'AIC-PRE-11', outcome: 'BLOCK', detail: 'secret-like pattern in prompt' }
    : pass('AIC-PRE-11');
}

/**
 * AIC-OUT-12: injection echo / instruction leakage. The output must not contain our delimiters,
 * mention the system prompt, or repeat instruction-like phrases from the untrusted input.
 */
export function checkOutputEcho(outputText: string, untrustedTexts: string[]): CheckResult {
  if (/untrusted_content/i.test(outputText)) {
    return { id: 'AIC-OUT-12', outcome: 'BLOCK', detail: 'delimiter leaked into output' };
  }
  if (/\bsystem\s+prompt\b/i.test(outputText)) {
    return { id: 'AIC-OUT-12', outcome: 'BLOCK', detail: 'mentions the system prompt' };
  }
  const echoed = INJECTION_PATTERNS.slice(0, 7).some(
    (pattern) => pattern.test(outputText) && untrustedTexts.some((t) => pattern.test(t)),
  );
  return echoed
    ? { id: 'AIC-OUT-12', outcome: 'BLOCK', detail: 'echoes an instruction from untrusted input' }
    : pass('AIC-OUT-12');
}
