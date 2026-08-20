import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../dist/agent/provider.js';
import { Executor } from '../dist/agent/tools.js';
import { Agent } from '../dist/agent/agent.js';
import { MemoryStore } from '../dist/memory/store.js';
import { parseUiDump, findMatchingNode } from '../dist/uidump.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

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
    ['qué estaba viendo ayer', { kind: 'tool', tool: 'viewingHistory' }],
    ['cuál es la última app que usé', { kind: 'tool', tool: 'viewingHistory' }],
    ['a qué hora juega river hoy', { kind: 'tool', tool: 'webSearch' }],
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

test('executor mapea navigate/openApp y reporta fallos', async () => {
  calls.length = 0;
  const nav = await executor.execute('navigate', { direction: 'right' });
  assert.equal(nav.status, 'success');
  assert.deepEqual(calls, [['key', 22]]);

  calls.length = 0;
  const app = await executor.execute('openApp', { app: 'youtube' });
  assert.equal(app.status, 'success');
  assert.deepEqual(calls, [['link', 'https://www.youtube.com/tv']]);

  calls.length = 0;
  const prime = await executor.execute('openApp', { app: 'prime video' });
  assert.equal(prime.status, 'success');
  assert.deepEqual(calls, [
    ['link', 'https://play.google.com/store/apps/details?id=com.amazon.amazonvideo.livingroom'],
  ]);

  calls.length = 0;
  const direct = await executor.execute('openApp', { app: 'org.jellyfin.androidtv' });
  assert.equal(direct.status, 'success');
  assert.deepEqual(calls, [
    ['link', 'https://play.google.com/store/apps/details?id=org.jellyfin.androidtv'],
  ]);

  const unknown = await executor.execute('openApp', { app: 'aplicacionfantasma' });
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

test('memory store persiste y consulta uso', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-'));
  const file = path.join(dir, 'usage.json');
  const store = new MemoryStore(file);
  const now = Date.now();
  store.record('app_open', 'youtube', new Date(now - 2 * 3600 * 1000).toISOString());
  store.record('app_open', 'netflix', new Date(now - 30 * 60 * 1000).toISOString());
  store.record('app_active', 'com.netflix.ninja', new Date(now - 10 * 60 * 1000).toISOString());

  const reopened = new MemoryStore(file);
  assert.equal(reopened.currentApp(), 'com.netflix.ninja');
  const opens = reopened.recentAppOpens(10).map((e) => e.app);
  assert.deepEqual(opens, ['youtube', 'netflix']);
  const recent = reopened.query(60 * 60 * 1000);
  assert.equal(recent.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('executor viewingHistory devuelve historial desde memoria', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-'));
  const store = new MemoryStore(path.join(dir, 'usage.json'));
  store.record('app_open', 'youtube', new Date().toISOString());
  const exec = new Executor(fakeRemote, store);
  const result = await exec.execute('viewingHistory', {});
  assert.equal(result.status, 'success');
  assert.match(result.message, /youtube/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('executor webSearch usa el search provider y reporta errores', async () => {
  const fakeSearch = {
    name: 'mock',
    search: async (query) => [
      { title: 'Horario River', url: 'https://ejemplo.com', content: 'juega a las 21:00' },
    ],
  };
  const exec = new Executor(fakeRemote, undefined, fakeSearch);
  const ok = await exec.execute('webSearch', { query: 'a qué hora juega river' });
  assert.equal(ok.status, 'success');
  assert.match(ok.message, /Horario River/);
  assert.match(ok.message, /https:\/\/ejemplo.com/);

  const noQuery = await exec.execute('webSearch', {});
  assert.equal(noQuery.status, 'failed');
  assert.match(noQuery.message, /query/);

  const noProvider = new Executor(fakeRemote);
  const fail = await noProvider.execute('webSearch', { query: 'x' });
  assert.equal(fail.status, 'failed');
  assert.match(fail.message, /no configurada/);

  const errSearch = {
    name: 'mock',
    search: async () => {
      throw new Error('timeout');
    },
  };
  const errExec = new Executor(fakeRemote, undefined, errSearch);
  const err = await errExec.execute('webSearch', { query: 'x' });
  assert.equal(err.status, 'failed');
  assert.match(err.message, /timeout/);
});

test('openai-compatible rechaza config incompleta', () => {
  const old = { url: process.env.LLM_API_URL, key: process.env.LLM_API_KEY, model: process.env.LLM_MODEL };
  process.env.LLM_PROVIDER = 'openai-compatible';
  delete process.env.LLM_API_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;
  assert.throws(() => createProvider({ language: 'es' }), /LLM_API_URL y LLM_MODEL/);
  process.env.LLM_PROVIDER = 'mock';
  process.env.LLM_API_URL = old.url;
  process.env.LLM_API_KEY = old.key;
  process.env.LLM_MODEL = old.model;
});

test('openai-compatible mapea tool_calls y valida tool desconocida', async () => {
  const old = {
    url: process.env.LLM_API_URL,
    key: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    provider: process.env.LLM_PROVIDER,
  };
  process.env.LLM_PROVIDER = 'openai-compatible';
  process.env.LLM_API_URL = 'http://fake.local/v1';
  process.env.LLM_MODEL = 'fake-model';

  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.ok(body.tools, 'debe incluir tools');
    assert.ok(Array.isArray(body.tools) && body.tools.length > 0, 'tools no vacío');
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { function: { name: 'openApp', arguments: '{"app":"youtube"}' } },
                ],
              },
            },
          ],
        };
      },
    };
  };

  const p = createProvider({ language: 'es' });
  const decision = await p.decide('abrí youtube', []);
  assert.equal(decision.kind, 'tool');
  assert.equal(decision.tool, 'openApp');
  assert.deepEqual(decision.params, { app: 'youtube' });

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { function: { name: 'executeAnything', arguments: '{}' } },
              ],
            },
          },
        ],
      };
    },
  });
  const bad = await p.decide('hacé cualquier cosa', []);
  assert.equal(bad.kind, 'error');
  assert.match(bad.message, /Tool no soportada/);

  globalThis.fetch = savedFetch;
  process.env.LLM_PROVIDER = old.provider;
  process.env.LLM_API_URL = old.url;
  process.env.LLM_API_KEY = old.key;
  process.env.LLM_MODEL = old.model;
});

test('parseUiDump extrae nodos con texto/bounds y filtra los vacíos', () => {
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<hierarchy rotation="0">
  <node index="0" text="" class="android.widget.FrameLayout" content-desc="" clickable="false" bounds="[0,0][1280,720]">
    <node index="1" text="Chefeelto y su tia" class="android.widget.TextView" content-desc="" clickable="true" bounds="[100,80][300,120]"/>
    <node index="2" text="ProgramadorWeb" class="android.widget.TextView" content-desc="perfil de programador" clickable="true" bounds="[100,130][300,170]"/>
    <node index="3" text="Cambiar de cuenta" class="android.widget.Button" content-desc="" clickable="true" bounds="[640,350][880,390]"/>
  </node>
</hierarchy>`;
  const nodes = parseUiDump(xml);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[1], {
    text: 'ProgramadorWeb',
    contentDesc: 'perfil de programador',
    className: 'android.widget.TextView',
    bounds: { x1: 100, y1: 130, x2: 300, y2: 170 },
    clickable: true,
  });
});

test('findMatchingNode matchea fuzzy (case, acentos, espacios)', () => {
  const nodes = parseUiDump(
    `<hierarchy><node><node text="ProgramadorWeb" content-desc="" clickable="true" bounds="[100,130][300,170]"/><node text="Cambiar de cuenta" content-desc="" clickable="true" bounds="[640,350][880,390]"/></node></hierarchy>`,
  );
  assert.equal(findMatchingNode(nodes, 'programador web')?.text, 'ProgramadorWeb');
  assert.equal(findMatchingNode(nodes, 'PROGRAMADOR')?.text, 'ProgramadorWeb');
  assert.equal(findMatchingNode(nodes, 'cámbiar de cuénta')?.text, 'Cambiar de cuenta');
  assert.equal(findMatchingNode(nodes, 'no existe'), null);
});

test('executor getScreenElements y clickElement usan el dumper inyectado', async () => {
  const taps = [];
  const fakeDumper = {
    getScreenElements: () => {
      calls.push(['dump']);
      return parseUiDump(
        `<hierarchy><node><node text="ProgramadorWeb" content-desc="" clickable="true" bounds="[100,130][300,170]"/><node text="Cambiar de cuenta" content-desc="" clickable="true" bounds="[640,350][880,390]"/></node></hierarchy>`,
      );
    },
    tapAt: (x, y) => {
      taps.push([x, y]);
      return true;
    },
  };
  const exec = new Executor(fakeRemote, undefined, undefined, fakeDumper);

  calls.length = 0;
  const list = await exec.execute('getScreenElements', {});
  assert.equal(list.status, 'success');
  assert.match(list.message, /ProgramadorWeb/);
  assert.match(list.message, /clickable/);
  assert.match(list.message, /\(200,150\)/);
  assert.deepEqual(calls, [['dump']]);

  const click = await exec.execute('clickElement', { text: 'cambiar de cuenta' });
  assert.equal(click.status, 'success');
  assert.match(click.message, /Tocado/);
  assert.deepEqual(taps, [[760, 370]]);

  const miss = await exec.execute('clickElement', { text: 'no existe' });
  assert.equal(miss.status, 'failed');
  assert.match(miss.message, /No encontré/);

  const noText = await exec.execute('clickElement', {});
  assert.equal(noText.status, 'failed');
  assert.match(noText.message, /requiere el parámetro text/);
});

test('executor tapAt escala coordenadas de la imagen chica a la real', async () => {
  const taps = [];
  const fakeDumper = {
    getScreenElements: () => [],
    tapAt: (x, y) => {
      taps.push([x, y]);
      return true;
    },
  };
  const fakeCapture = () => ({
    dataUrl: 'data:image/jpeg;base64,xx',
    width: 224,
    height: 126,
    bytes: 1000,
    realSize: { width: 1280, height: 720 },
  });
  const exec = new Executor(fakeRemote, undefined, undefined, fakeDumper, fakeCapture);

  const shot = await exec.execute('seeScreen', {});
  assert.equal(shot.status, 'success');
  assert.match(shot.message, /224x126/);

  const ok = await exec.execute('tapAt', { x: 112, y: 63 });
  assert.equal(ok.status, 'success');
  assert.deepEqual(taps, [[640, 360]]);
  assert.match(ok.message, /Toqué en \(640,360\)/);

  const exec2 = new Executor(fakeRemote, undefined, undefined, fakeDumper);
  const fail = await exec2.execute('tapAt', { x: 1, y: 1 });
  assert.equal(fail.status, 'failed');
  assert.match(fail.message, /seeScreen antes de tapAt/);

  const bad = await exec.execute('tapAt', {});
  assert.equal(bad.status, 'failed');
  assert.match(bad.message, /x e y/);
});