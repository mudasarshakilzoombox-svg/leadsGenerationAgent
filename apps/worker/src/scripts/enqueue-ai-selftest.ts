/* eslint-disable no-console -- a command-line tool: printing the result is its job. */
// `pnpm ai:selftest`: enqueue one `ai.selftest` job for the running worker (ops check of the AI
// path). Fake provider in fake mode; the real provider only with INTEGRATIONS_MODE=real and a key.
import { JOB_NAMES, QUEUE_NAMES } from '@lga/contracts';
import {
  closeRedis,
  createJobEnvelope,
  createRedis,
  jobId,
  loadWorkerEnv,
  queuePrefix,
} from '@lga/core';
import { Queue } from 'bullmq';

const env = loadWorkerEnv(process.env);
const connection = createRedis(env.VALKEY_URL, 'queue-producer');
const queue = new Queue(QUEUE_NAMES.ai, { connection, prefix: queuePrefix(env) });
try {
  const id = jobId('ai-selftest', Date.now());
  await queue.add(
    JOB_NAMES.aiSelftest,
    createJobEnvelope({
      workspaceId: null,
      requestId: `cli-${id}`,
      actorUserId: null,
      entity: { type: 'system', id: 'ai-selftest' },
    }),
    { jobId: id, attempts: 1, removeOnComplete: { count: 50 } },
  );
  console.log(
    `Enqueued ${JOB_NAMES.aiSelftest} (${id}). The worker records the result in ai_runs.`,
  );
} finally {
  await queue.close();
  await closeRedis(connection);
}
