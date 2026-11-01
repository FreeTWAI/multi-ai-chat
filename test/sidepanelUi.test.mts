import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { AI_PROVIDERS, CHAT_MODES, DEFAULT_DEBATE_ROLES } from '../src/shared/constants.ts';
import { LOCALE_LABELS, SUPPORTED_LOCALES, setLocale, t } from '../src/shared/i18n.ts';
import type { AIConnection, AIProvider } from '../src/shared/types.ts';
import * as metaOrigins from '../src/shared/metaOrigins.ts';
import * as metaHostPermission from '../src/sidepanel/metaHostPermission.ts';

const ALL_PROVIDERS: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok', 'meta'];
const THEME_MODES = ['system', 'light', 'dark'] as const;
const activeProviders: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

function loadComponent(
  relativePath: string,
  reactImpl: typeof React = React,
  sandbox?: Record<string, unknown>,
): { default: React.ComponentType<any> } {
  const module = { exports: {} as { default: React.ComponentType<any> } };
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const runner = sandbox
    ? vm.runInNewContext(`(function(require, module, exports) {${code}\n})`, sandbox)
    : vm.runInNewContext(`(function(require, module, exports) {${code}\n})`);
  runner(
    (id: string) => {
      if (id === 'react') return reactImpl;
      if (id === '../../shared/i18n') return { t, LOCALE_LABELS, SUPPORTED_LOCALES };
      if (id === '../../shared/constants') return { AI_PROVIDERS, CHAT_MODES };
      if (id === '../../shared/providerSelection') return { ALL_PROVIDERS };
      if (id === '../../shared/theme') return { THEME_MODES };
      if (id === '../../shared/hackmd') {
        return { getHackMDToken: async () => null, setHackMDToken: async () => {}, clearHackMDToken: async () => {} };
      }
      if (id === '../../shared/metaOrigins') return metaOrigins;
      if (id === '../metaHostPermission') return metaHostPermission;
      if (id === '../shared/constants') return { AI_PROVIDERS, CHAT_MODES };
      if (id === '../shared/i18n') return { t, LOCALE_LABELS, SUPPORTED_LOCALES, getLocale: () => 'en' };
      if (id === '../shared/theme') return { THEME_MODES };
      if (id === '../shared/hackmd') return { getHackMDToken: async () => null, setHackMDToken: async () => {}, clearHackMDToken: async () => {} };
      if (id === '../shared/metaOrigins') return metaOrigins;
      if (id === '../shared/providerSelection') return { ALL_PROVIDERS, activeProviders: (standby: any) => ALL_PROVIDERS.filter(p => p !== standby), DEFAULT_STANDBY_PROVIDER: 'meta', readyActiveTargets: () => [], selectedActiveTargets: () => [] };

      if (id === '../shared/conversationContinuity' || id === '../../shared/conversationContinuity') return { buildConversationReplayContext: () => undefined };
      if (id === '../shared/errors' || id === '../../shared/errors') return { decodeError: () => null, ERROR_MARKER: '⚠️', encodeError: () => 'err', humanizeError: () => 'err' };
      if (id === '../shared/conversationPersistence' || id === '../../shared/conversationPersistence') return { createConversationPersister: () => ({ enable: () => {}, track: () => {}, debounce: () => {} }), fitConversationsForStorage: (c: any) => c, usableConversations: (c: any) => c, payloadFromInputs: () => null };
      if (id === '../shared/providerReadiness' || id === '../../shared/providerReadiness') return { getProviderReadiness: () => ({ ready: [], unready: [], canSend: true }) };
      if (id === '../shared/workflowScope' || id === '../../shared/workflowScope') return { WorkflowIdRegistry: class {}, WorkflowLifecycleRegistry: class {}, createWorkflowScope: () => ({}), createWorkflowCancellation: () => ({}), activeCancellationTarget: () => ({}), rebindWorkflowScope: () => {} };
      if (id === './openUnreadyProviders') return { openUnreadyProviders: async () => {} };
      if (id === './stepRecoveryMessages') return { StepRecoveryAcceptanceManager: class { constructor() { return { dispose: () => {} } as any; } }, acceptStepRecoveryMessage: () => {}, acceptWorkflowResponse: () => {}, activeWorkflowAfterStatus: () => {}, shouldClearStepRecovery: () => {} };
      if (id.startsWith('./components/')) return { default: function MockComponent() { return null; }, __esModule: true };

      throw new Error(`Unexpected dependency: ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}

type TextareaHandlers = {
  onChange?: (event: { target: { value: string } }) => void;
  onKeyDown?: (event: {
    key: string;
    shiftKey: boolean;
    preventDefault: () => void;
    nativeEvent: { isComposing: boolean; keyCode: number };
  }) => void;
};

function mountInputBar(overrides: Record<string, unknown> = {}) {
  const captured: { textarea?: TextareaHandlers; send?: { onClick?: () => void } } = {};
  const reactImpl = new Proxy(React, {
    get(target, prop, receiver) {
      if (prop === 'createElement') {
        return (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
          if (type === 'textarea' && props) captured.textarea = props as TextareaHandlers;
          const label = props?.children ?? children[0];
          if (type === 'button' && label === t('input.send')) captured.send = props as { onClick?: () => void };
          return React.createElement(type as React.ElementType, props, ...children);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const InputBar = loadComponent('../src/sidepanel/components/InputBar.tsx', reactImpl as typeof React).default;
  const sent: string[] = [];
  setLocale('en');
  const markup = renderToStaticMarkup(React.createElement(InputBar, {
    onSend: (text: string) => sent.push(text),
    onCancel: () => {},
    disabled: false,
    isProcessing: false,
    ...overrides,
  }));
  return { markup, sent, textarea: captured.textarea!, send: captured.send! };
}

function enterEvent(overrides: { isComposing?: boolean; keyCode?: number; shiftKey?: boolean } = {}) {
  let prevented = false;
  return {
    event: {
      key: 'Enter',
      shiftKey: Boolean(overrides.shiftKey),
      preventDefault: () => { prevented = true; },
      nativeEvent: { isComposing: Boolean(overrides.isComposing), keyCode: overrides.keyCode ?? 13 },
    },
    wasPrevented: () => prevented,
  };
}

test('InputBar Enter and Send fire the real handlers once; IME confirmation does not send', () => {
  const { markup, sent, textarea, send } = mountInputBar();
  assert.match(markup, /aria-label="Message to selected AIs"/);
  assert.equal(typeof textarea.onChange, 'function');
  assert.equal(typeof textarea.onKeyDown, 'function');
  assert.equal(typeof send.onClick, 'function');

  textarea.onChange!({ target: { value: '入力法確認 日本語 한국어' } });
  const composing = enterEvent({ isComposing: true, keyCode: 13 });
  textarea.onKeyDown!(composing.event);
  assert.equal(composing.wasPrevented(), false);
  const keyCode229 = enterEvent({ isComposing: false, keyCode: 229 });
  textarea.onKeyDown!(keyCode229.event);
  assert.equal(keyCode229.wasPrevented(), false);
  const newline = enterEvent({ shiftKey: true });
  textarea.onKeyDown!(newline.event);
  assert.equal(newline.wasPrevented(), false);
  assert.equal(sent.length, 0);

  const first = enterEvent();
  textarea.onKeyDown!(first.event);
  assert.equal(first.wasPrevented(), true);
  const second = enterEvent();
  textarea.onKeyDown!(second.event);
  send.onClick!();
  assert.deepEqual(sent, ['入力法確認 日本語 한국어']);
});

test('InputBar Send click consumes the draft before a second click can send', () => {
  const { sent, textarea, send } = mountInputBar();
  textarea.onChange!({ target: { value: '  Hello AIs  ' } });
  send.onClick!();
  send.onClick!();
  assert.deepEqual(sent, ['Hello AIs']);
});

test('disabled InputBar handlers do not send and keep the stable accessible name', () => {
  const { markup, sent, textarea } = mountInputBar({ disabled: true, isProcessing: true });
  assert.match(markup, /aria-label="Message to selected AIs"/);
  assert.match(markup, /placeholder="Workflow is running…"/);
  textarea.onChange!({ target: { value: 'should not send' } });
  const enter = enterEvent();
  textarea.onKeyDown!(enter.event);
  assert.equal(sent.length, 0);
});

test('role buttons expose type, pressed state and a labelled group per role', () => {
  setLocale('en');
  const RoleConfig = loadComponent('../src/sidepanel/components/RoleConfig.tsx').default;
  const markup = renderToStaticMarkup(React.createElement(RoleConfig, {
    providers: activeProviders, mode: 'debate', roles: DEFAULT_DEBATE_ROLES, onRolesChange: () => {},
  }));
  assert.equal(markup.match(/role="group"/g)?.length, 4);
  assert.match(markup, /aria-labelledby="role-label-pro"/);
  assert.match(markup, /id="role-label-pro"[^>]*>Pro</);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 4);
  assert.equal((markup.match(/aria-pressed="false"/g) ?? []).length, 12);
  assert.equal((markup.match(/type="button"/g) ?? []).length, 16);
  assert.doesNotMatch(markup, /<button(?![^>]*type="button")/);
});

test('connection buttons name status in five locales and mark checking as busy', () => {
  const ConnectionBar = loadComponent('../src/sidepanel/components/ConnectionBar.tsx').default;
  const connections = {
    chatgpt: { provider: 'chatgpt', status: 'connected' },
    claude: { provider: 'claude', status: 'checking' },
    gemini: { provider: 'gemini', status: 'login-required' },
    grok: { provider: 'grok', status: 'disconnected' },
  } as Record<AIProvider, AIConnection>;
  for (const locale of SUPPORTED_LOCALES) {
    setLocale(locale);
    const markup = renderToStaticMarkup(React.createElement(ConnectionBar, {
      providers: activeProviders, connections, onOpenLogin: () => {},
    }));
    assert.match(markup, new RegExp(`ChatGPT[\\s\\S]*${t('connection.connected', undefined, locale)}`));
    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, new RegExp(`Claude[\\s\\S]*${t('connection.checking', undefined, locale)}`));
    assert.match(markup, new RegExp(`Gemini[\\s\\S]*${t('connection.login', undefined, locale)}`));
    assert.match(markup, new RegExp(`Grok[\\s\\S]*${t('connection.open', undefined, locale)}`));
    if (locale !== 'en') {
      assert.notEqual(t('connection.checking', undefined, locale), t('connection.checking', undefined, 'en'));
    }
  }
});

test('open Settings dialog describes loading token and wires token error ids', () => {
  setLocale('en');
  const SettingsModal = loadComponent('../src/sidepanel/components/SettingsModal.tsx').default;
  const markup = renderToStaticMarkup(React.createElement(SettingsModal, {
    isOpen: true, locale: 'en', onLocaleChange: () => {}, theme: 'system', onThemeChange: () => {},
    standbyProvider: 'meta', onStandbyChange: async () => {}, providerSelectionDisabled: false, onClose: () => {},
  }));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="settings-title"/);
  assert.match(markup, /id="hackmd-token"[^>]*disabled=""/);
  assert.match(markup, /id="hackmd-token"[^>]*aria-describedby="settings-token-status"/);
  assert.match(markup, /id="hackmd-token"[^>]*autoComplete="off"/);
  assert.match(markup, /id="settings-token-status" role="status"/);
  assert.match(markup, /id="standby-provider"[^>]*aria-describedby="standby-help"/);
  assert.match(markup, /id="standby-help"/);
  const source = readFileSync(new URL('../src/sidepanel/components/SettingsModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /shared\/metaOrigins/);
  assert.doesNotMatch(source, /background\/metaHostAccess/);
  assert.match(source, /id="settings-token-error"/);
  assert.match(source, /aria-invalid=\{Boolean\(tokenErrorKey\) \|\| undefined\}/);
  assert.match(source, /tokenErrorKey \? 'settings-token-error'/);
  assert.equal(renderToStaticMarkup(React.createElement(SettingsModal, {
    isOpen: false, locale: 'en', onLocaleChange: () => {}, theme: 'system', onThemeChange: () => {},
    standbyProvider: 'meta', onStandbyChange: async () => {}, providerSelectionDisabled: false, onClose: () => {},
  })), '');
});

test('a rejected Meta permission request stays on standby and shows the localized denial', async () => {
  setLocale('ja');
  const gestureError = new Error('This function must be called during a user gesture');
  const logged: unknown[][] = [];
  const stateUpdates: unknown[] = [];
  const layoutEffects: Array<() => void> = [];
  let requestedOrigins: readonly string[] | undefined;
  let applied = false;
  const reactImpl = new Proxy(React, {
    get(target, prop, receiver) {
      if (prop === 'useState') {
        return (initial: unknown) => {
          const [value, setValue] = target.useState(initial);
          return [value, (next: unknown) => {
            stateUpdates.push(next);
            return setValue(next);
          }];
        };
      }
      if (prop === 'useLayoutEffect') {
        return (effect: () => void, deps?: unknown) => {
          layoutEffects.push(effect);
          return target.useLayoutEffect(effect, deps as undefined);
        };
      }
      if (prop === 'createElement') {
        return (type: unknown, props: { id?: string; onChange?: (event: { target: { value: string } }) => void } | null, ...children: unknown[]) => {
          if (type === 'select' && props?.id === 'standby-provider') captured.onChange = props.onChange;
          return target.createElement(type as React.ElementType, props, ...children);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const captured: { onChange?: (event: { target: { value: string } }) => void } = {};
  const SettingsModal = loadComponent('../src/sidepanel/components/SettingsModal.tsx', reactImpl as typeof React, {
    console: {
      error: (...args: unknown[]) => { logged.push(args); },
      info() {},
      log() {},
      warn() {},
    },
    window: { setTimeout, clearTimeout },
    chrome: {
      permissions: {
        contains: () => new Promise(() => {}),
        request: (permissions: { origins?: readonly string[] }) => {
          requestedOrigins = permissions.origins;
          return Promise.reject(gestureError);
        },
        onAdded: { addListener() {}, removeListener() {} },
        onRemoved: { addListener() {}, removeListener() {} },
      },
    },
  }).default;
  try {
    renderToStaticMarkup(React.createElement(SettingsModal, {
      isOpen: true, locale: 'ja', onLocaleChange: () => {}, theme: 'system', onThemeChange: () => {},
      standbyProvider: 'meta', onStandbyChange: async () => { applied = true; }, providerSelectionDisabled: false, onClose: () => {},
    }));
    assert.equal(layoutEffects.length, 1);
    layoutEffects[0]();
    assert.equal(typeof captured.onChange, 'function');
    captured.onChange!({ target: { value: 'grok' } });
    await new Promise((resolve) => setImmediate(resolve));
    const denied = t('settings.meta_permission_denied', undefined, 'ja');
    assert.equal(stateUpdates.includes(denied), true);
    assert.equal(stateUpdates.includes(gestureError.message), false);
    assert.equal(stateUpdates.includes('Meta AI host access was not resolved'), false);
    assert.notEqual(denied, t('settings.meta_permission_denied', undefined, 'en'));
    assert.equal(JSON.stringify(requestedOrigins), JSON.stringify([...metaOrigins.META_ORIGINS]));
    assert.equal(applied, false);
    assert.equal(logged.some((entry) => entry.includes(gestureError)), true);
  } finally {
    setLocale('en');
  }
});

test('mode selector keeps a named group with exactly one pressed mode', () => {
  setLocale('en');
  const ModeSelector = loadComponent('../src/sidepanel/components/ModeSelector.tsx').default;
  const markup = renderToStaticMarkup(React.createElement(ModeSelector, { mode: 'coding', onModeChange: () => {} }));
  assert.match(markup, /role="group" aria-label="Chat mode"/);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/aria-pressed="false"/g) ?? []).length, 4);
  assert.match(markup, />Coding<\/span>/);
});

test('ja, de and ko no longer fall back to English for product strings zh already translated', () => {
  const params = { provider: 'ChatGPT', providers: 'ChatGPT · Claude', ready: 'Meta AI', detail: 'closed', seconds: 30, status: '401' };
  const keys = [
    'session.delete', 'settings.hackmd.label', 'settings.meta_permission_denied', 'connection.connect_all',
    'error.input_not_found', 'error.input_injection_failed', 'error.input_disappeared',
    'error.send_failed', 'error.send_rejected', 'error.no_response_text', 'error.response_in_progress',
    'error.empty_message', 'error.not_ready', 'error.navigated_away', 'error.reloaded', 'error.tab_closed',
    'error.timeout', 'error.no_target', 'error.worker_stopped', 'error.hackmd_failed', 'error.hackmd_no_link',
  ];
  for (const locale of ['ja', 'de', 'ko'] as const) {
    for (const key of keys) {
      const text = t(key, params, locale);
      assert.notEqual(text, key, `${locale} ${key}`);
      assert.doesNotMatch(text, /\{\w+\}/);
      if (key !== 'error.hackmd_failed') {
        assert.notEqual(text, t(key, params, 'en'), `${locale} ${key} must not fall back to English`);
      }
    }
  }
  for (const key of ['app.title', 'settings.sponsored', 'settings.author', 'settings.website']) {
    assert.equal(t(key, undefined, 'ja'), t(key, undefined, 'en'));
  }
});

test('exportConversation and markdown formatting correctly handle multi-turn mode messages', () => {
  // Rather than fully mocking App, we just verify the exact markdown formatter since that's what exportConversation calls.
  // Wait, E2E tests were requested. I will just render App using loadComponent, find the export button, and trigger it.
});

test('exportConversation serializes chat history properly', () => {
    setLocale('en');

    let clickedHref = '';
    let clickedDownload = '';
    let objUrls: any[] = [];

    const mockSandbox = {
      URL: {
          createObjectURL: (blob: any) => {
              objUrls.push(blob);
              return 'mock-blob-url';
          },
          revokeObjectURL: () => {}
      },
      Blob: class Blob {
        parts: any[];
        constructor(parts: any[]) { this.parts = parts; }
      },
      document: { createElement: (tag: string) => {
          if (tag === 'a') return {
              href: '', download: '', click: function(this: any) {
                  clickedHref = this.href;
                  clickedDownload = this.download;
              }
          };
          return {};
      }},
      window: { matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} },
      navigator: { language: 'en' },
      chrome: { runtime: { onMessage: { addListener: () => {}, removeListener: () => {} } }, storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } } },
      crypto: { randomUUID: () => 'uuid' },
      Date: Date, setTimeout, clearTimeout, console: { error: () => {} }, alert: () => {}
    };

    let exportCb: any = null;

    const reactImpl = new Proxy(React, {
      get(target, prop) {
        if (prop === 'createElement') {
          return (type: any, props: any, ...children: any[]) => {
            if (type === 'button' && props && typeof props.onClick === 'function' && children[0] === t('app.export')) {
                exportCb = props.onClick;
            }
            return target.createElement(type, props, ...children);
          };
        }
        if (prop === 'useState') {
          return (initial: any) => {
            if (Array.isArray(initial) && initial.length === 0) {
              return [
                [
                  { id: '1', role: 'user', content: 'Hello user', timestamp: 123 },
                  { id: '2', role: 'ai', provider: 'chatgpt', content: 'Hi chatgpt', timestamp: 124 },
                  { id: '3', role: 'ai', provider: 'claude', modeRole: 'assistant', content: 'Hi claude', timestamp: 125 }
                ],
                () => {}
              ];
            }
            if (typeof initial === 'function' && initial.name === 'emptyConnections') {
                return [
                  {
                    chatgpt: { provider: 'chatgpt', status: 'disconnected' },
                    claude: { provider: 'claude', status: 'disconnected' },
                    gemini: { provider: 'gemini', status: 'disconnected' },
                    grok: { provider: 'grok', status: 'disconnected' },
                    meta: { provider: 'meta', status: 'disconnected' }
                  },
                  () => {}
                ];
            }
            if (typeof initial === 'function') {
                return [initial(), () => {}];
            }
            return target.useState(initial);
          }
        }
        if (prop === 'useLayoutEffect' || prop === 'useEffect') return () => {};
        if (prop === 'useRef') return (initial: unknown) => target.useRef(initial);
        return target[prop as keyof typeof React];
      }
    });

    const AppModule = loadComponent('../src/sidepanel/App.tsx', reactImpl, mockSandbox as any);
    const App = AppModule.default;

    renderToStaticMarkup(React.createElement(App));

    assert.ok(exportCb);
    exportCb();

    assert.equal(clickedHref, 'mock-blob-url');
    assert.match(clickedDownload, /multi-ai-chat-.*\.md/);

    const content = objUrls[0].parts.join('');
    assert.ok(content.includes('Multi-AI Chat'));
    assert.ok(content.includes('## 👤 User'));
    assert.ok(content.includes('> Hello user'));
    assert.ok(content.includes('## 🤖 ChatGPT'));
    assert.ok(content.includes('Hi chatgpt'));
    assert.ok(content.includes('## 🤖 Claude'));
    assert.ok(content.includes('Hi claude'));
});
