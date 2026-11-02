import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderRequestError,
  runRoundtableWorkflow,
  type RoundtableWorkflowDependencies,
} from '../src/background/roundtableRecovery.ts';
import type { AIProvider, RoundtableRoles, StepRecoveryAction } from '../src/shared/types.ts';

const roles: RoundtableRoles = {
  first: 'claude',
  second: 'gemini',
  third: 'grok',
  fourth: 'chatgpt',
};

function createHarness(options: {
  decisions: StepRecoveryAction[];
  failAttempts: Set<number>;
  rawError?: string;
}) {
  let attempt = 0;
  let requestSequence = 0;
  const decisions = [...options.decisions];
  const sends: { provider: AIProvider; prompt: string; workflowId: string; requestId: string }[] = [];
  const recoveryRequests: { provider: AIProvider; requestId: string; error: unknown }[] = [];
  let aborted = false;

  const dependencies: RoundtableWorkflowDependencies = {
    checkAborted: () => {
      if (aborted) throw new DOMException('Workflow cancelled', 'AbortError');
    },
    providerName: (provider) => provider,
    buildPrompt: (text, round, provider, history) => `${text}|${round}|${provider}|${history.map((item) => item.text).join(',')}`,
    createRequestId: () => `request-${++requestSequence}`,
    sendStatus: async () => {},
    sendRoleAssignment: async () => {},
    sendAndWait: async (provider, prompt, workflowId, requestId) => {
      attempt += 1;
      sends.push({ provider, prompt, workflowId, requestId });
      if (options.failAttempts.has(attempt)) {
        throw new ProviderRequestError(provider, workflowId, requestId, options.rawError ?? 'provider failed');
      }
      return `answer-${requestId}`;
    },
    requestRecovery: async (provider, error, _workflowId, requestId) => {
      recoveryRequests.push({ provider, requestId, error });
      const decision = decisions.shift();
      assert.ok(decision, 'a recovery decision is required for every simulated failure');
      return decision;
    },
    resetProvider: async () => {},
    cancelWorkflow: async () => { aborted = true; },
  };

  return { dependencies, sends, recoveryRequests };
}

test('Provider connection drop triggers automatic fallback to secondary model provider', async () => {
  // We use the runRoundtableWorkflow harness to simulate a connection drop and automatic retry (fallback) logic
  const rawError = 'connection dropped during streaming';

  // Instruct the harness to fail on the very first send attempt (attempt 1) and decide to 'retry'
  const harness = createHarness({ decisions: ['retry'], failAttempts: new Set([1]), rawError });

  const history = await runRoundtableWorkflow('question', roles, 'workflow-fallback', harness.dependencies);

  // 20 successful items in history (5 rounds * 4 providers)
  assert.equal(history.length, 20);

  // 21 sends total because the first attempt failed and was retried
  assert.equal(harness.sends.length, 21);

  // The first and second sends should be from the primary provider ('claude') that failed and retried
  assert.equal(harness.sends[0].provider, 'claude');
  assert.equal(harness.sends[1].provider, 'claude');

  // Assert that a recovery was requested due to the drop
  assert.equal(harness.recoveryRequests.length, 1);
  assert.equal(harness.recoveryRequests[0].provider, 'claude');
});

test('Fallback maintains streaming conversation state after connection drop', async () => {
  const rawError = 'connection dropped';
  // Fail on attempt 1, skip this provider for the round (effectively falling back to the next provider/round maintaining state)
  const harness = createHarness({ decisions: ['skip'], failAttempts: new Set([1]), rawError });

  const history = await runRoundtableWorkflow('question', roles, 'workflow-state', harness.dependencies);

  // The first turn is marked as skipped, but the conversation completes 20 logical turns
  assert.equal(history.length, 20);
  assert.equal(history[0].name, 'claude');
  assert.equal(history[0].text, '(no response — skipped)');

  // The next provider correctly continues the conversation context
  assert.equal(history[1].name, 'gemini');
  assert.ok(history[1].text.startsWith('answer-request-'));

  // Verify that the prompt sent to the secondary provider maintained the history state (including the skipped indicator)
  assert.match(harness.sends[1].prompt, /\(no response — skipped\)/);
});
