import assert from 'node:assert/strict';
import test from 'node:test';
import { getProviderFromUrl } from '../src/shared/providerUrl.ts';
import { ALL_PROVIDERS, activeProviders, readyActiveTargets } from '../src/shared/providerSelection.ts';
import { AI_PROVIDERS } from '../src/shared/constants.ts';
import type { AIConnection } from '../src/shared/types.ts';

// Tests focusing on checking provider adapter configs. Note: directly mocking service-worker is difficult with node:test without a dedicated browser context.
// Service-worker function testing is covered via test suite in original structure if exportable, here we can test the specific configurations.
test('Provider adapter config check', () => {
    for (const provider of ALL_PROVIDERS) {
        assert.ok(AI_PROVIDERS[provider].url, `Provider ${provider} is missing URL`);
        assert.ok(AI_PROVIDERS[provider].name, `Provider ${provider} is missing name`);
    }
});

test('Session switching test cases', () => {
    assert.equal(getProviderFromUrl('https://chatgpt.com/c/123'), 'chatgpt');
    assert.equal(getProviderFromUrl('https://chat.openai.com/?model=gpt'), 'chatgpt');
    assert.equal(getProviderFromUrl('https://claude.ai/new'), 'claude');
    assert.equal(getProviderFromUrl('https://gemini.google.com/app'), 'gemini');
    assert.equal(getProviderFromUrl('https://grok.com/'), 'grok');
    assert.equal(getProviderFromUrl('https://www.meta.ai/prompt/123'), 'meta');
    assert.equal(getProviderFromUrl('https://meta.ai/'), 'meta');
});

test('Invalid session URLs are rejected', () => {
    assert.equal(getProviderFromUrl('https://evil.example/?next=https://chatgpt.com/'), null);
    assert.equal(getProviderFromUrl('https://chatgpt.com.evil.example/'), null);
    assert.equal(getProviderFromUrl('https://evil-chatgpt.com/'), null);
    assert.equal(getProviderFromUrl('http://chatgpt.com/'), null);
    assert.equal(getProviderFromUrl('javascript:location.href="https://claude.ai"'), null);
});

test('Session switching connection tests', () => {
    const connections: Partial<Record<string, Pick<AIConnection, 'status'>>> = {
        meta: { status: 'connected' },
        chatgpt: { status: 'login-required' }
    };

    assert.deepEqual(readyActiveTargets(connections, 'grok'), ['meta']);
    assert.deepEqual(readyActiveTargets(connections, 'chatgpt'), ['meta']);
});

test('adapter configurations are evaluated successfully', () => {
  const providers = ['chatgpt', 'claude', 'gemini', 'grok', 'meta'];
  for (const provider of providers) {
    const aiProvider = AI_PROVIDERS[provider as keyof typeof AI_PROVIDERS];
    assert.ok(aiProvider, `Config for ${provider} should exist.`);
  }
});
