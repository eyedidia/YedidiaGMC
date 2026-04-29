import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { signChallenge } from './gmCrypto';

// ─── BLE UUIDs ────────────────────────────────────────────────────────────────

const SERVICE_UUID_V2 = 'A3A40000-0000-1000-8000-00805F9B34FB';
const AUTH_CHAR_V2    = 'A3A40001-0000-1000-8000-00805F9B34FB';
const CHALLENGE_CHAR  = 'A3A40002-0000-1000-8000-00805F9B34FB';
const COMMAND_CHAR    = 'A3A40003-0000-1000-8000-00805F9B34FB';
const STATUS_CHAR     = 'A3A40004-0000-1000-8000-00805F9B34FB';
// const ENROLL_CHAR  = 'A3A40005-0000-1000-8000-00805F9B34FB'; // reserved for future use

const SERVICE_UUID_V1 = '0000FFF0-0000-1000-8000-00805F9B34FB';
const AUTH_CHAR_V1    = '0000FFF2-0000-1000-8000-00805F9B34FB';
const CHALLENGE_V1    = '0000FFF1-0000-1000-8000-00805F9B34FB';
const COMMAND_V1      = '0000FFF3-0000-1000-8000-00805F9B34FB';

// ─── Commands ─────────────────────────────────────────────────────────────────

export const BLE_COMMANDS: Record<string, number[]> = {
  LOCK:          [0x01, 0x01, 0, 0, 0, 0, 0, 0],
  UNLOCK:        [0x01, 0x02, 0, 0, 0, 0, 0, 0],
  UNLOCK_DRIVER: [0x01, 0x03, 0, 0, 0, 0, 0, 0],
  START:         [0x02, 0x01, 0, 0, 0, 0, 0, 0],
  STOP:          [0x02, 0x02, 0, 0, 0, 0, 0, 0],
  TRUNK:         [0x03, 0x01, 0, 0, 0, 0, 0, 0],
  WINDOWS_VENT:  [0x04, 0x01, 0, 0, 0, 0, 0, 0],
  WINDOWS_CLOSE: [0x04, 0x02, 0, 0, 0, 0, 0, 0],
  HORN:          [0x05, 0x01, 0x0A, 0, 0, 0, 0, 0],
  STATUS_REQ:    [0x06, 0x00, 0, 0, 0, 0, 0, 0],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type BleStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'error'
  | 'disconnected';

export interface VehicleStatus {
  isLocked: boolean;
  isRunning: boolean;
  trunkOpen: boolean;
  doorOpen: boolean;
  batteryLow: boolean;
  plugged: boolean;
  charging: boolean;
}

export interface BleEngineCallbacks {
  onStatusChange: (status: BleStatus) => void;
  onVehicleStatus: (status: VehicleStatus) => void;
  onError: (error: string) => void;
  onRssi?: (rssi: number) => void;
}

// ─── BleEngine ────────────────────────────────────────────────────────────────

export class BleEngine {
  private peripheralId: string | null = null;
  private isV2Protocol: boolean = true;
  private callbacks: BleEngineCallbacks;
  private keyId: string = '';
  private privateKeyHex: string = '';
  private bleManagerEmitter: NativeEventEmitter | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: any[] = [];
  private currentStatus: BleStatus = 'idle';

  constructor(callbacks: BleEngineCallbacks) {
    this.callbacks = callbacks;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private setStatus(status: BleStatus): void {
    this.currentStatus = status;
    this.callbacks.onStatusChange(status);
  }

  private get serviceUUID(): string {
    return this.isV2Protocol ? SERVICE_UUID_V2 : SERVICE_UUID_V1;
  }

  private get authChar(): string {
    return this.isV2Protocol ? AUTH_CHAR_V2 : AUTH_CHAR_V1;
  }

  private get challengeChar(): string {
    return this.isV2Protocol ? CHALLENGE_CHAR : CHALLENGE_V1;
  }

  private get commandChar(): string {
    return this.isV2Protocol ? COMMAND_CHAR : COMMAND_V1;
  }

  // ─── Initialize ───────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await BleManager.start({ showAlert: false });

    const BleManagerModule = NativeModules.BleManager;
    if (BleManagerModule) {
      this.bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    }

    if (this.bleManagerEmitter) {
      const discoverListener = this.bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        this.handleDiscoverPeripheral,
      );
      const disconnectListener = this.bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        this.handleDisconnect,
      );
      const updateListener = this.bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        this.handleCharacteristicUpdate,
      );
      this.listeners.push(discoverListener, disconnectListener, updateListener);
    }
  }

  // ─── Connect ──────────────────────────────────────────────────────────────

  async connect(
    _vin: string,
    keyId: string,
    privateKeyHex: string,
  ): Promise<void> {
    this.keyId = keyId;
    this.privateKeyHex = privateKeyHex;
    this.peripheralId = null;

    this.setStatus('scanning');

    try {
      // Scan for both V2 and V1 service UUIDs
      await BleManager.scan(
        [SERVICE_UUID_V2, SERVICE_UUID_V1],
        10, // seconds
        false,
      );
      // Discovery is handled in handleDiscoverPeripheral
    } catch (err) {
      this.setStatus('error');
      this.callbacks.onError(`Scan failed: ${String(err)}`);
    }
  }

  private handleDiscoverPeripheral = async (peripheral: {
    id: string;
    advertising?: { serviceUUIDs?: string[] };
  }): Promise<void> => {
    if (this.peripheralId) {
      return; // already found one
    }

    const serviceUUIDs: string[] =
      peripheral.advertising?.serviceUUIDs ?? [];
    const isV2 = serviceUUIDs.some(
      u => u.toUpperCase() === SERVICE_UUID_V2.toUpperCase(),
    );
    const isV1 = serviceUUIDs.some(
      u => u.toUpperCase() === SERVICE_UUID_V1.toUpperCase(),
    );

    if (!isV2 && !isV1) {
      return;
    }

    this.isV2Protocol = isV2;
    this.peripheralId = peripheral.id;

    try {
      await BleManager.stopScan();
      this.setStatus('connecting');

      await BleManager.connect(peripheral.id);
      await BleManager.retrieveServices(peripheral.id);

      // Subscribe to challenge notifications
      await BleManager.startNotification(
        peripheral.id,
        this.serviceUUID,
        this.challengeChar,
      );

      if (this.isV2Protocol) {
        // Subscribe to status notifications
        await BleManager.startNotification(
          peripheral.id,
          this.serviceUUID,
          STATUS_CHAR,
        );
      }

      this.setStatus('authenticating');

      // Request status — vehicle will send a challenge back
      await this.sendCommand(BLE_COMMANDS.STATUS_REQ);
    } catch (err) {
      this.setStatus('error');
      this.callbacks.onError(`Connect failed: ${String(err)}`);
    }
  };

  private handleDisconnect = (): void => {
    this.peripheralId = null;
    this.setStatus('disconnected');
  };

  private handleCharacteristicUpdate = async (data: {
    peripheral: string;
    characteristic: string;
    value: number[];
  }): Promise<void> => {
    const charUpper = data.characteristic.toUpperCase();

    if (
      charUpper === CHALLENGE_CHAR.toUpperCase() ||
      charUpper === CHALLENGE_V1.toUpperCase()
    ) {
      await this.handleChallenge(data.value);
      return;
    }

    if (charUpper === STATUS_CHAR.toUpperCase()) {
      const vehicleStatus = this.parseVehicleStatus(data.value);
      this.callbacks.onVehicleStatus(vehicleStatus);
    }
  };

  // ─── Handle Challenge ─────────────────────────────────────────────────────

  private async handleChallenge(challenge: number[]): Promise<void> {
    if (!this.peripheralId) {
      return;
    }

    try {
      const challengeBytes = new Uint8Array(challenge);
      const signature = await signChallenge(challengeBytes, this.privateKeyHex);

      // Build auth packet: [0x01] + keyId (4 bytes) + signature (64 bytes) = 69 bytes
      const keyIdBytes = new Uint8Array(4);
      for (let i = 0; i < 4; i++) {
        keyIdBytes[i] = parseInt(
          this.keyId.slice(i * 2, i * 2 + 2),
          16,
        );
      }

      const authPacket = new Uint8Array(1 + 4 + 64);
      authPacket[0] = 0x01;
      authPacket.set(keyIdBytes, 1);
      authPacket.set(signature, 5);

      await BleManager.write(
        this.peripheralId,
        this.serviceUUID,
        this.authChar,
        Array.from(authPacket),
        authPacket.length,
      );

      this.setStatus('ready');
    } catch (err) {
      this.setStatus('error');
      this.callbacks.onError(`Auth failed: ${String(err)}`);
    }
  }

  // ─── Send Command ─────────────────────────────────────────────────────────

  async sendCommand(command: number[]): Promise<void> {
    if (!this.peripheralId) {
      throw new Error('Not connected to any peripheral');
    }
    if (
      this.currentStatus !== 'ready' &&
      this.currentStatus !== 'authenticating'
    ) {
      throw new Error(`Cannot send command in state: ${this.currentStatus}`);
    }

    await BleManager.write(
      this.peripheralId,
      this.serviceUUID,
      this.commandChar,
      command,
      command.length,
    );
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.peripheralId) {
      try {
        await BleManager.disconnect(this.peripheralId);
      } catch {
        // ignore disconnect errors
      }
      this.peripheralId = null;
    }
    this.setStatus('idle');
  }

  // ─── Parse Vehicle Status ─────────────────────────────────────────────────

  private parseVehicleStatus(bytes: number[]): VehicleStatus {
    const byte0 = bytes[0] ?? 0;
    const byte1 = bytes[1] ?? 0;

    return {
      isLocked:   (byte0 & 0x01) !== 0,
      isRunning:  (byte0 & 0x02) !== 0,
      trunkOpen:  (byte0 & 0x04) !== 0,
      doorOpen:   (byte0 & 0x08) !== 0,
      batteryLow: (byte1 & 0x01) !== 0,
      plugged:    (byte1 & 0x02) !== 0,
      charging:   (byte1 & 0x04) !== 0,
    };
  }

  // ─── Request Status ───────────────────────────────────────────────────────

  async requestStatus(): Promise<void> {
    await this.sendCommand(BLE_COMMANDS.STATUS_REQ);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  cleanup(): void {
    for (const listener of this.listeners) {
      listener.remove();
    }
    this.listeners = [];
  }
}
