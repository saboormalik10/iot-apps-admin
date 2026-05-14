import { Schema, model, Document, Types } from 'mongoose';

export interface ISensorPref {
  NMEA: string;
  Type: string;
  Unit: string;
  Desc: string;
  EnShow?: number;
  EnLog?: number;
}

export interface IDeviceSettings extends Document {
  deviceId: Types.ObjectId;
  organizationId: Types.ObjectId;
  qqEnabled: boolean;
  qqGpsHeight: boolean;
  qfeHeightM: number;
  qnhHeightM: number;
  dewPointEnabled: boolean;
  windRoseUnit: string;
  windRosePeriod: string;
  windRoseOrient: string;
  graphicalType: string;
  graphItem: number;
  colorScheme: number;
  pageLayout: number;
  unitWindSpeed: string;
  unitPressure: string;
  unitTemperature: string;
  unitAltitude: string;
  sensorShowPrefs: ISensorPref[] | null;
  sensorLogPrefs: ISensorPref[] | null;
  updatedAt: Date;
}

const deviceSettingsSchema = new Schema<IDeviceSettings>(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true, unique: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    qqEnabled: { type: Boolean, default: false },
    qqGpsHeight: { type: Boolean, default: true },
    qfeHeightM: { type: Number, default: 0 },
    qnhHeightM: { type: Number, default: 0 },
    dewPointEnabled: { type: Boolean, default: false },
    windRoseUnit: { type: String, default: '0' },
    windRosePeriod: { type: String, default: '0' },
    windRoseOrient: { type: String, default: 'true' },
    graphicalType: { type: String, default: 'rose' },
    graphItem: { type: Number, default: 0 },
    colorScheme: { type: Number, default: 2 },
    pageLayout: { type: Number, default: 0 },
    unitWindSpeed: { type: String, default: 'm/s' },
    unitPressure: { type: String, default: 'hPa' },
    unitTemperature: { type: String, default: '°C' },
    unitAltitude: { type: String, default: 'm' },
    sensorShowPrefs: { type: Schema.Types.Mixed, default: null },
    sensorLogPrefs: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

deviceSettingsSchema.index({ deviceId: 1 }, { unique: true });
deviceSettingsSchema.index({ organizationId: 1 });

export const DeviceSettings = model<IDeviceSettings>('DeviceSettings', deviceSettingsSchema);
