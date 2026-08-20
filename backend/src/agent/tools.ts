import { ExecutionResult, ToolDef } from './types';
import { TvRemote } from '../remote';
import { RemoteKeyCode } from '../remote';
import { MemoryStore } from '../memory/store';
import { SearchProvider } from '../search/search';
import { captureScreenForVision, adbConnect, adbAvailable } from '../screencap';

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
      'Captura y describe la pantalla actual de la TV. Usala cuando necesites ver la interfaz para navegar (menús, perfiles, apps) antes de usar navigate/enter.',
    params: [],
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

export class Executor {
  private lastScreen: ScreenCapture | null = null;

  constructor(
    private readonly remote: TvRemote,
    private readonly memory?: MemoryStore,
    private readonly search?: SearchProvider,
  ) {}

  get lastScreenCapture(): ScreenCapture | null {
    return this.lastScreen;
  }

  clearScreenCapture(): void {
    this.lastScreen = null;
  }

  async execute(tool: string, params: Record<string, unknown>): Promise<ExecutionResult> {
    if (tool === 'webSearch') {
      return this.runWebSearch(params);
    }
    if (tool === 'seeScreen') {
      return this.runSeeScreen();
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
      if (!adbAvailable()) {
        return { status: 'failed', message: 'ADB no disponible en el backend' };
      }
      adbConnect();
      const image = captureScreenForVision(224);
      this.lastScreen = image;
      return {
        status: 'success',
        message: `Pantalla capturada (${image.width}x${image.height}). La imagen se adjuntó al contexto.`,
        image,
      };
    } catch (err) {
      this.lastScreen = null;
      return {
        status: 'failed',
        message: `No se pudo capturar la pantalla: ${(err as Error).message}`,
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