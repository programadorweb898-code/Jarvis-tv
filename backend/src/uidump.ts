/**
 * Lectura de la UI de la Android TV vía ADB (uiautomator dump) y tap por coordenadas.
 * Es el reemplazo del AccessibilityService en TVs donde el firmware no permite
 * habilitar accesibilidad de terceros. Texto plano, sin imágenes.
 */

import { execFileSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { ADB_PATH, TV_ADDRESS, adbArgs } from './screencap';

export interface UiNode {
  text: string;
  contentDesc: string;
  className: string;
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
  clickable: boolean;
}

const DUMP_PATH = '/sdcard/jarvis_dump.xml';

function adbShell(cmd: string): string {
  return execFileSync(ADB_PATH, adbArgs(['shell', cmd]), {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

/**
 * Ejecuta `uiautomator dump` y devuelve el XML de la jerarquía de UI.
 * Devuelve null si ADB falla o el archivo no se genera.
 */
export function runUiautomatorDump(): string | null {
  try {
    adbShell(`uiautomator dump ${DUMP_PATH}`);
    const raw = execFileSync(ADB_PATH, adbArgs(['exec-out', 'cat', DUMP_PATH]), {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const start = raw.indexOf('<?xml');
    return start >= 0 ? raw.slice(start) : raw.trim();
  } catch (err) {
    console.error('[uidump] error al capturar jerarquía UI:', (err as Error).message);
    return null;
  }
}

function parseBounds(spec: string): { x1: number; y1: number; x2: number; y2: number } | null {
  const m = spec.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map(Number);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2 };
}

/**
 * Parsea el XML de uiautomator a una lista plana de nodos, filtrando los que no
 * tienen text ni contentDescription, o que tienen bounds inválidos.
 */
export function parseUiDump(xml: string): UiNode[] {
  const out: UiNode[] = [];
  if (!xml || !xml.includes('<hierarchy')) return out;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
  });

  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch {
    return out;
  }

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;

    const text = String(rec['@_text'] ?? '').trim();
    const contentDesc = String(rec['@_content-desc'] ?? '').trim();
    const className = String(rec['@_class'] ?? '');
    const boundsSpec = String(rec['@_bounds'] ?? '');
    const clickable = String(rec['@_clickable'] ?? '') === 'true';

    if (text || contentDesc) {
      const bounds = parseBounds(boundsSpec);
      if (bounds) {
        out.push({ text, contentDesc, className, bounds, clickable });
      }
    }

    const children = rec['node'];
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
    } else if (children) {
      walk(children);
    }
  };

  const hierarchy = (root as Record<string, unknown>)['hierarchy'];
  walk(hierarchy ?? root);
  return out;
}

/** Devuelve los elementos de la pantalla actual como array de nodos (vacío si no hay). */
export function getScreenElements(): UiNode[] {
  const xml = runUiautomatorDump();
  if (xml === null) {
    console.error('[uidump] no se pudo obtener la jerarquía UI');
    return [];
  }
  const nodes = parseUiDump(xml);
  if (nodes.length === 0) {
    console.warn('[uidump] jerarquía sin nodos con texto o sin bounds válidos');
  }
  return nodes;
}

/** Normaliza texto: minúsculas, sin acentos ni diacríticos ni espacios. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Busca el nodo cuyo text o contentDesc coincida mejor (case-insensitive, sin
 * acentos) contra el query. Prefiere igualdad total, luego inclusión.
 */
export function findMatchingNode(nodes: UiNode[], query: string): UiNode | null {
  const q = normalize(query);
  if (!q) return null;

  const candidates = nodes.filter(
    (n) => normalize(n.text).includes(q) || normalize(n.contentDesc).includes(q),
  );
  if (candidates.length === 0) return null;

  const exact = candidates.find(
    (n) => normalize(n.text) === q || normalize(n.contentDesc) === q,
  );
  if (exact) return exact;

  // El que tenga el texto más corto que contenga el query (más parecido).
  candidates.sort(
    (a, b) =>
      (normalize(a.text) || normalize(a.contentDesc)).length -
      (normalize(b.text) || normalize(b.contentDesc)).length,
  );
  return candidates[0];
}

/** Ejecuta un tap en las coordenadas dadas vía ADB. */
export function tapAt(x: number, y: number): boolean {
  try {
    adbShell(`input tap ${Math.round(x)} ${Math.round(y)}`);
    return true;
  } catch (err) {
    console.error('[uidump] error en input tap:', (err as Error).message);
    return false;
  }
}