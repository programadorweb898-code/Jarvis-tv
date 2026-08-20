import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../dist/agent/provider.js';
import { Executor } from '../dist/agent/tools.js';
import { Agent } from '../dist/agent/agent.js';

const calls = [];
const fakeRemote = {
  isReady: () => true,
  sendKey: (key) => {
    calls.push(['key', key]);
    return true;
  },
  sendAppLink: (link) => {
    calls.push(['link', link]);
    return true;
  },
};

const provider = createProvider({ language: 'es' });
const executor = new Executor(fakeRemote);
const agent = new Agent(provider, executor);

test('mock provider decide herramientas correctas', async () => {
  const cases = [
    ['subí el volumen', { kind: 'tool', tool: 'volumeUp' }],
    ['bajá el volumen', { kind: 'tool', tool: 'volumeDown' }],
    ['pausá la reproducción', { kind: 'tool', tool: 'pause' }],
    ['reproducí el video', { kind: 'tool', tool: 'play' }],
    ['silenciá la TV', { kind: 'tool', tool: 'mute' }],
    ['andá a la pantalla de inicio', { kind: 'tool', tool: 'home' }],
    ['volvé atrás', { kind: 'tool', tool: 'back' }],
    ['navegá a la derecha', { kind: 'tool', tool: 'navigate', params: { direction: 'right' } }],
    ['navegá hacia arriba', { kind: 'tool', tool: 'navigate', params: { direction: 'up' } }],
    ['abrí youtube', { kind: 'tool', tool: 'openApp', params: { app: 'youtube' } }],
    ['qué hora es', { kind: 'reply' }],
  ];
  for (const [text, expected] of cases) {
    const decision = await provider.decide(text, []);
    assert.equal(decision.kind, expected.kind, text);
    if (decision.kind === 'tool') {
      assert.equal(decision.tool, expected.tool, text);
      if (expected.params) assert.deepEqual(decision.params, expected.params, text);
    }
  }
});

test('executor mapea navigate/openApp y reporta fallos', () => {
  calls.length = 0;
  const nav = executor.execute('navigate', { direction: 'right' });
  assert.equal(nav.status, 'success');
  assert.deepEqual(calls, [['key', 22]]);

  calls.length = 0;
  const app = executor.execute('openApp', { app: 'youtube' });
  assert.equal(app.status, 'success');
  assert.deepEqual(calls, [['link', 'https://www.youtube.com/tv']]);

  calls.length = 0;
  const prime = executor.execute('openApp', { app: 'prime video' });
  assert.equal(prime.status, 'success');
  assert.deepEqual(calls, [
    ['link', 'https://play.google.com/store/apps/details?id=com.amazon.amazonvideo.livingroom'],
  ]);

  calls.length = 0;
  const direct = executor.execute('openApp', { app: 'org.jellyfin.androidtv' });
  assert.equal(direct.status, 'success');
  assert.deepEqual(calls, [
    ['link', 'https://play.google.com/store/apps/details?id=org.jellyfin.androidtv'],
  ]);

  const unknown = executor.execute('openApp', { app: 'aplicacionfantasma' });
  assert.equal(unknown.status, 'failed');
  assert.match(unknown.message, /App no soportada/);
});

test('agente end-to-end con remote falso', async () => {
  calls.length = 0;
  const result = await agent.handle('subí el volumen');
  assert.equal(result.decision.kind, 'tool');
  assert.equal(result.execution?.status, 'success');
  assert.equal(result.execution?.message, 'volumeUp ejecutado');
  assert.deepEqual(calls, [['key', 24]]);

  const reply = await agent.handle('contame un chiste');
  assert.equal(reply.decision.kind, 'reply');
  assert.equal(reply.execution, null);
});