import { AndroidRemote, AndroidRemoteOptions } from 'androidtv-remote';
import fs from 'fs';
import path from 'path';

export const RemoteDirection = {
  START_LONG: 1,
  END_LONG: 2,
  SHORT: 3,
} as const;

export const RemoteKeyCode = {
  HOME: 3,
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  DPAD_CENTER: 23,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  ENTER: 66,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_PLAY: 126,
  MEDIA_PAUSE: 127,
  MUTE: 164,
} as const;

export type ActionName =
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'back'
  | 'home'
  | 'enter'
  | 'navigateUp'
  | 'navigateDown'
  | 'navigateLeft'
  | 'navigateRight';

const ACTION_KEYCODES: Record<ActionName, number> = {
  volumeUp: RemoteKeyCode.VOLUME_UP,
  volumeDown: RemoteKeyCode.VOLUME_DOWN,
  mute: RemoteKeyCode.MUTE,
  play: RemoteKeyCode.MEDIA_PLAY,
  pause: RemoteKeyCode.MEDIA_PAUSE,
  playPause: RemoteKeyCode.MEDIA_PLAY_PAUSE,
  back: RemoteKeyCode.BACK,
  home: RemoteKeyCode.HOME,
  enter: RemoteKeyCode.DPAD_CENTER,
  navigateUp: RemoteKeyCode.DPAD_UP,
  navigateDown: RemoteKeyCode.DPAD_DOWN,
  navigateLeft: RemoteKeyCode.DPAD_LEFT,
  navigateRight: RemoteKeyCode.DPAD_RIGHT,
};

export function resolveKeyCode(action: string): number | null {
  return ACTION_KEYCODES[action as ActionName] ?? null;
}

export interface TvRemoteConfig {
  host: string;
  certPath: string;
  keyPath: string;
  pairingPort: number;
  remotePort: number;
  name: string;
}

export function loadTvRemoteConfig(): TvRemoteConfig {
  const certDir = process.env.JARVIS_TV_CERT_DIR || path.join(__dirname, '..', 'certs');
  return {
    host: process.env.JARVIS_TV_HOST || '192.168.1.95',
    certPath: process.env.JARVIS_TV_CERT || path.join(certDir, 'jarvis-cert.pem'),
    keyPath: process.env.JARVIS_TV_KEY || path.join(certDir, 'jarvis-key.pem'),
    pairingPort: Number(process.env.JARVIS_TV_PAIR_PORT || 6467),
    remotePort: Number(process.env.JARVIS_TV_REMOTE_PORT || 6466),
    name: process.env.JARVIS_TV_NAME || 'jarvis-backend',
  };
}

export class TvRemote {
  ready = false;
  private remote: AndroidRemote | null = null;
  private readonly config: TvRemoteConfig;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly onStateChange: (ready: boolean) => void;

  constructor(config: TvRemoteConfig, onStateChange: (ready: boolean) => void) {
    this.config = config;
    this.onStateChange = onStateChange;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.remote?.stop();
    this.remote = null;
    this.setReady(false);
  }

  isReady(): boolean {
    return this.ready;
  }

  sendKey(keyCode: number): boolean {
    if (!this.remote || !this.ready) return false;
    try {
      this.remote.sendKey(keyCode, RemoteDirection.SHORT);
      return true;
    } catch (err) {
      console.error('[tv-remote] sendKey falló:', err);
      return false;
    }
  }

  sendAppLink(link: string): boolean {
    if (!this.remote || !this.ready) return false;
    try {
      this.remote.sendAppLink(link);
      return true;
    } catch (err) {
      console.error('[tv-remote] sendAppLink falló:', err);
      return false;
    }
  }

  private connect(): void {
    const { host, certPath, keyPath, pairingPort, remotePort, name } = this.config;
    try {
      const options: AndroidRemoteOptions = {
        pairing_port: pairingPort,
        remote_port: remotePort,
        name,
        cert: {
          key: fs.readFileSync(keyPath, 'utf8'),
          cert: fs.readFileSync(certPath, 'utf8'),
        },
      };
      const remote = new AndroidRemote(host, options);
      this.remote = remote;

      remote.on('ready', () => {
        console.log(`[tv-remote] LISTO en ${host}:${remotePort}`);
        this.setReady(true);
      });
      remote.on('unpaired', () => {
        console.warn(`[tv-remote] no pareado (se requiere pairing) en ${host}`);
        this.setReady(false);
        this.scheduleRetry();
      });
      remote.on('error', (err: Error) => {
        console.error(`[tv-remote] error:`, err);
        this.setReady(false);
        this.scheduleRetry();
      });
      remote.on('powered', (powered: boolean) =>
        console.log(`[tv-remote] powered: ${powered}`),
      );
      remote.on('volume', (volume: unknown) =>
        console.log(`[tv-remote] volume: ${JSON.stringify(volume)}`),
      );

      remote.start().catch((err: Error) => {
        console.error(`[tv-remote] start error:`, err.message);
        this.setReady(false);
        this.scheduleRetry();
      });
    } catch (err) {
      console.error(`[tv-remote] no se pudo iniciar (cert?):`, err);
      this.setReady(false);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, 5000);
  }

  private setReady(value: boolean): void {
    if (this.ready === value) return;
    this.ready = value;
    this.onStateChange(value);
  }
}