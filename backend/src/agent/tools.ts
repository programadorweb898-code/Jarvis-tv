import { ExecutionResult, ToolDef } from './types';
import { TvRemote } from '../remote';
import { RemoteKeyCode } from '../remote';
import { MemoryStore } from '../memory/store';
import { SearchProvider } from '../search/search';
import { captureScreenForVision, adbConnect, adbAvailable, type VisionImage } from '../screencap';
import { getScreenElements, findMatchingNode, tapAt as adbTap } from '../uidump';

export const TOOLS: ToolDef[] = [
  { name: 'volumeUp', description: 'Sube el volumen de la TV', params: [] },
  { name: 'volumeDown', description: 'Baja el volumen de la TV', params: [] },
  { name: 'mute', description: 'Silencia o desilencia la TV', params: [] },
  { name: 'play', description: 'Reproduce el contenido actual', params: [] },
  { name: 'pause', description: 'Pausa el contenido actual', params: [] },
  { name: 'playPause', description: 'Alterna reproducir/pausar', params: [] },
  { name: 'back', description: 'Vuelve atrás (botón retroceder)', params: [] },
  { name: 'home', description: 'Va a la pantalla de inicio', params: [] },
  { name: 'enter', description: 'Confirma/selecciona el elemento enfocado (botón OK/Enter)', params: [] },
  {
    name: 'seeScreen',
    description:
      'Captura y describe la pantalla actual de la TV. Último recurso: usala solo si getScreenElements no encuentra el elemento buscado (interfaces en canvas/Compose sin semántica).',
    params: [],
  },
  {
    name: 'getScreenElements',
    description:
      'Lista los elementos visibles de la pantalla actual de la TV (texto, si es clickable y su posición). Usala para ubicar perfiles, botones o menús antes de clickElement.',
    params: [],
  },
  {
    name: 'clickElement',
    description:
      'Toca/activa un elemento visible de la pantalla por su texto o descripción (p. ej. "Cambiar de cuenta", un perfil). Usala después de getScreenElements.',
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'texto o descripción del elemento a tocar',
        required: true,
      },
    ],
  },
  {
    name: 'tapAt',
    description:
      'Toca la pantalla en las coordenadas x,y que hayas identificado sobre la última imagen vista con seeScreen. Las coordenadas van en el mismo sistema (ancho x alto) que se te informó al ver la pantalla. Requiere haber llamado seeScreen antes en esta conversación.',
    params: [
      {
        name: 'x',
        type: 'number',
        description: 'coordenada x en el sistema de la imagen de seeScreen',
        required: true,
      },
      {
        name: 'y',
        type: 'number',
        description: 'coordenada y en el sistema de la imagen de seeScreen',
        required: true,
      },
    ],
  },
  {
    name: 'navigate',
    description: 'Navega el foco en una dirección',
    params: [
      {
        name: 'direction',
        type: 'string',
        description: 'up, down, left o right',
        required: true,
      },
    ],
  },
  {
    name: 'openApp',
    description: 'Abre una aplicación en la TV',
    params: [
      {
        name: 'app',
        type: 'string',
        description: 'nombre de la app (youtube, netflix, ...)',
        required: true,
      },
    ],
  },
  {
    name: 'viewingHistory',
    description:
      'Consulta qué aplicaciones se usaron recientemente en la TV (memoria de uso). Sin parámetros devuelve las últimas apps abiertas con su fecha/hora.',
    params: [],
  },
  {
    name: 'webSearch',
    description:
      'Busca información actualizada en internet (noticias, horarios, resultados, etc.). Usala cuando el usuario pida datos que no sabés con certeza o que cambian con el tiempo.',
    params: [
      {
        name: 'query',
        type: 'string',
        description: 'consulta a buscar en internet',
        required: true,
      },
    ],
  },
];

const NAVIGATION: Record<string, number> = {
  up: RemoteKeyCode.DPAD_UP,
  down: RemoteKeyCode.DPAD_DOWN,
  left: RemoteKeyCode.DPAD_LEFT,
  right: RemoteKeyCode.DPAD_RIGHT,
};

interface AppEntry {
  package: string;
  link?: string;
}

const APPS: Record<string, AppEntry> = {
  youtube: {
    package: 'com.google.android.youtube.tv',
    link: 'https://www.youtube.com/tv',
  },
  netflix: {
    package: 'com.netflix.ninja',
    link: 'https://www.netflix.com/',
  },
  primevideo: { package: 'com.amazon.amazonvideo.livingroom' },
  disneyplus: {
    package: 'com.disney.disneyplus',
    link: 'https://www.disneyplus.com/',
  },
  spotify: { package: 'com.spotify.tv.android' },
  twitch: { package: 'tv.twitch.android.app' },
  plex: { package: 'com.plexapp.android' },
  jellyfin: { package: 'org.jellyfin.androidtv' },
  crunchyroll: { package: 'com.crunchyroll.crunchyroll' },
  kodi: { package: 'org.xbmc.kodi' },
  vlc: { package: 'org.videolan.vlc' },
};

function normalizeAppName(app: string): string {
  return app.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Resuelve el app link a lanzar:
 * - app con deep link nativo (youtube, netflix) -> su URI.
 * - app conocida -> URL de Play Store (Play services la resuelve al launch intent).
 * - string con puntos (package name directo) -> URL de Play Store.
 */
export function appLinkFor(app: string): string | null {
  const raw = app.trim();
  if (raw.includes('.')) {
    return `https://play.google.com/store/apps/details?id=${raw}`;
  }
  const entry = APPS[normalizeAppName(raw)];
  if (!entry) return null;
  return entry.link ?? `https://play.google.com/store/apps/details?id=${entry.package}`;
}

export function supportedApps(): string[] {
  return Object.keys(APPS);
}

export function findTool(name: string): ToolDef | null {
  return TOOLS.find((t) => t.name === name) ?? null;
}

export interface ScreenCapture {
  dataUrl: string;
  width: number;
  height: number;
}

export interface UiDumper {
  getScreenElements(): import('../uidump').UiNode[];
  tapAt(x: number, y: number): boolean;
}

export class Executor {
  private lastScreen: ScreenCapture | null = null;
  private lastScreenRealSize: { width: number; height: number } | null = null;

  constructor(
    private readonly remote: TvRemote,
    private readonly memory?: MemoryStore,
    private readonly search?: SearchProvider,
    private readonly uiDumper?: UiDumper,
    private readonly captureVision?: () => VisionImage,
  ) {}

  get lastScreenCapture(): ScreenCapture | null {
    return this.lastScreen;
  }

  clearScreenCapture(): void {
    this.lastScreen = null;
    this.lastScreenRealSize = null;
  }

  async execute(tool: string, params: Record<string, unknown>): Promise<ExecutionResult> {
    if (tool === 'webSearch') {
      return this.runWebSearch(params);
    }
    if (tool === 'seeScreen') {
      return this.runSeeScreen();
    }
    if (tool === 'getScreenElements') {
      return this.runGetScreenElements();
    }
    if (tool === 'clickElement') {
      return this.runClickElement(params);
    }
    if (tool === 'tapAt') {
      return this.runTapAt(params);
    }
    if (!this.remote.isReady()) {
      return { status: 'failed', message: 'TV remoto no disponible' };
    }
    if (tool === 'openApp') {
      const link = appLinkFor(String(params.app ?? ''));
      if (!link) {
        return {
          status: 'failed',
          message: `App no soportada: ${params.app}. Disponibles: ${supportedApps().join(', ')}`,
        };
      }
      const launched = this.remote.sendAppLink(link);
      this.memory?.record('app_open', String(params.app ?? ''));
      return launched
        ? { status: 'success', message: `openApp ejecutado (${link})` }
        : { status: 'failed', message: 'Fallo al lanzar la app' };
    }
    if (tool === 'viewingHistory') {
      const opens = this.memory?.recentAppOpens(15) ?? [];
      if (opens.length === 0) {
        return { status: 'success', message: 'No hay apps registradas en la memoria de uso.' };
      }
      const lines = opens.map((e) => `${e.timestamp} ${e.app}`);
      return { status: 'success', message: lines.join('\n') };
    }
    const sent = this.send(tool, params);
    if (sent === null) {
      return { status: 'failed', message: `Tool no soportada: ${tool}` };
    }
    if (!sent) {
      return { status: 'failed', message: `Fallo al enviar tecla para ${tool}` };
    }
    return { status: 'success', message: `${tool} ejecutado` };
  }

  private async runSeeScreen(): Promise<ExecutionResult> {
    try {
      const image = this.captureVision
        ? this.captureVision()
        : (() => {
            if (!adbAvailable()) {
              throw new Error('ADB no disponible en el backend');
            }
            adbConnect();
            return captureScreenForVision(224);
          })();
      this.lastScreen = image;
      this.lastScreenRealSize = image.realSize ?? { width: image.width, height: image.height };
      return {
        status: 'success',
        message: `Pantalla capturada (${image.width}x${image.height}). La imagen se adjuntó al contexto. Las coordenadas de tapAt van en este sistema ${image.width}x${image.height}.`,
        image,
      };
    } catch (err) {
      this.lastScreen = null;
      this.lastScreenRealSize = null;
      return {
        status: 'failed',
        message: `No se pudo capturar la pantalla: ${(err as Error).message}`,
      };
    }
  }

  private async runTapAt(params: Record<string, unknown>): Promise<ExecutionResult> {
    const x = Number(params.x);
    const y = Number(params.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { status: 'failed', message: 'tapAt requiere los parámetros numéricos x e y' };
    }
    if (!this.lastScreen || !this.lastScreenRealSize) {
      return {
        status: 'failed',
        message: 'No hay una captura de pantalla reciente. Llamá a seeScreen antes de tapAt.',
      };
    }
    const scaleX = this.lastScreenRealSize.width / this.lastScreen.width;
    const scaleY = this.lastScreenRealSize.height / this.lastScreen.height;
    const realX = Math.round(x * scaleX);
    const realY = Math.round(y * scaleY);
    const ok = this.uiDumper ? this.uiDumper.tapAt(realX, realY) : adbTap(realX, realY);
    return ok
      ? { status: 'success', message: `Toqué en (${realX},${realY})` }
      : { status: 'failed', message: `Fallo al tocar en (${realX},${realY})` };
  }

  private async runGetScreenElements(): Promise<ExecutionResult> {
    try {
      const nodes = this.uiDumper ? this.uiDumper.getScreenElements() : getScreenElements();
      if (nodes.length === 0) {
        return {
          status: 'failed',
          message:
            'No se detectaron elementos con texto en la pantalla. La app puede usar una interfaz sin semántica (canvas/Compose): usá seeScreen para verla.',
        };
      }
      const lines = nodes.map(
        (n, i) =>
          `${i + 1}. '${n.text || n.contentDesc}'${n.clickable ? ' (clickable)' : ''} en (${Math.round(
            (n.bounds!.x1 + n.bounds!.x2) / 2,
          )},${Math.round((n.bounds!.y1 + n.bounds!.y2) / 2)})`,
      );
      return { status: 'success', message: lines.join('\n') };
    } catch (err) {
      return {
        status: 'failed',
        message: `No se pudo leer la pantalla: ${(err as Error).message}`,
      };
    }
  }

  private async runClickElement(params: Record<string, unknown>): Promise<ExecutionResult> {
    const query = String(params.text ?? '').trim();
    if (!query) {
      return { status: 'failed', message: 'clickElement requiere el parámetro text' };
    }
    try {
      const nodes = this.uiDumper ? this.uiDumper.getScreenElements() : getScreenElements();
      if (nodes.length === 0) {
        return {
          status: 'failed',
          message: `No pude tocar "${query}": no encontré elementos por texto. Usá seeScreen para ver la pantalla y después tapAt con las coordenadas del elemento.`,
        };
      }
      const match = findMatchingNode(nodes, query);
      if (!match || !match.bounds) {
        return {
          status: 'failed',
          message: `No encontré "${query}" por texto. Usá seeScreen para ver la pantalla y después tapAt con las coordenadas del elemento. Elementos disponibles:\n${nodes
            .map((n) => `- '${n.text || n.contentDesc}'`)
            .join('\n')}`,
        };
      }
      const cx = Math.round((match.bounds.x1 + match.bounds.x2) / 2);
      const cy = Math.round((match.bounds.y1 + match.bounds.y2) / 2);
      const ok = this.uiDumper ? this.uiDumper.tapAt(cx, cy) : adbTap(cx, cy);
      return ok
        ? { status: 'success', message: `Tocado "${query}" en (${cx},${cy})` }
        : { status: 'failed', message: `Fallo al tocar "${query}"` };
    } catch (err) {
      return {
        status: 'failed',
        message: `Error en clickElement: ${(err as Error).message}`,
      };
    }
  }

  private async runWebSearch(params: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.search) {
      return {
        status: 'failed',
        message: 'Búsqueda web no configurada (SearchProvider ausente).',
      };
    }
    const query = String(params.query ?? '').trim();
    if (!query) {
      return { status: 'failed', message: 'webSearch requiere el parámetro query' };
    }
    try {
      const results = await this.search.search(query, 5);
      if (results.length === 0) {
        return { status: 'success', message: `Sin resultados para: ${query}` };
      }
      const lines = results.map((r) => `${r.title}\n${r.url}\n${r.content}`.trim());
      return { status: 'success', message: lines.join('\n\n') };
    } catch (err) {
      return {
        status: 'failed',
        message: `Error de búsqueda: ${(err as Error).message}`,
      };
    }
  }

  private send(tool: string, params: Record<string, unknown>): boolean | null {
    switch (tool) {
      case 'volumeUp':
        return this.remote.sendKey(RemoteKeyCode.VOLUME_UP);
      case 'volumeDown':
        return this.remote.sendKey(RemoteKeyCode.VOLUME_DOWN);
      case 'mute':
        return this.remote.sendKey(RemoteKeyCode.MUTE);
      case 'play':
        return this.remote.sendKey(RemoteKeyCode.MEDIA_PLAY);
      case 'pause':
        return this.remote.sendKey(RemoteKeyCode.MEDIA_PAUSE);
      case 'playPause':
        return this.remote.sendKey(RemoteKeyCode.MEDIA_PLAY_PAUSE);
      case 'back':
        return this.remote.sendKey(RemoteKeyCode.BACK);
      case 'home':
        return this.remote.sendKey(RemoteKeyCode.HOME);
      case 'enter':
        return this.remote.sendKey(RemoteKeyCode.DPAD_CENTER);
      case 'navigate': {
        const key = NAVIGATION[String(params.direction ?? '').toLowerCase()];
        return key === undefined ? null : this.remote.sendKey(key);
      }
      default:
        return null;
    }
  }
}