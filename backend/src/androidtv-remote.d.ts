declare module 'androidtv-remote' {
  import { EventEmitter } from 'events';

  export interface AndroidRemoteOptions {
    pairing_port?: number;
    remote_port?: number;
    name?: string;
    cert?: {
      key: string;
      cert: string;
    };
  }

  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options: AndroidRemoteOptions);
    start(): Promise<void>;
    stop(): void;
    sendCode(code: string): void;
    sendKey(key: number, direction: number): void;
    sendPower(): void;
    sendAppLink(appLink: string): void;
  }

  export const RemoteDirection: Record<string, number>;
  export const RemoteKeyCode: Record<string, number>;
}