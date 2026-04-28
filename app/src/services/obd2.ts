// OBD2 ELM327 fallback service — stub implementation.
// Real OBD2 BLE integration is complex and beyond current scope.
// All methods return mock/placeholder data.

export interface OBD2Data {
  engineRPM?: number;
  vehicleSpeed?: number;
  coolantTemp?: number;
  fuelLevel?: number;
  batteryVoltage?: number;
  dtcCodes?: string[];
}

export class OBD2Service {
  private connected: boolean = false;
  private deviceId: string | null = null;

  async connect(deviceId: string): Promise<boolean> {
    // Stub: simulate connection delay
    await new Promise<void>(resolve => setTimeout(resolve, 500));
    this.deviceId = deviceId;
    this.connected = true;
    return true;
  }

  async getEngineData(): Promise<OBD2Data> {
    if (!this.connected) {
      throw new Error('OBD2 device not connected');
    }

    // Mock data
    return {
      engineRPM: 800 + Math.floor(Math.random() * 200),
      vehicleSpeed: 0,
      coolantTemp: 88 + Math.floor(Math.random() * 10),
      fuelLevel: 72,
      batteryVoltage: 12.4 + Math.random() * 0.4,
      dtcCodes: [],
    };
  }

  async getDTCodes(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('OBD2 device not connected');
    }
    // Mock: no DTC codes
    return [];
  }

  async clearDTCodes(): Promise<boolean> {
    if (!this.connected) {
      throw new Error('OBD2 device not connected');
    }
    // Mock: success
    return true;
  }

  disconnect(): void {
    this.connected = false;
    this.deviceId = null;
  }
}
