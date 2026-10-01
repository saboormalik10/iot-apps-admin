import type { ParameterId } from '@/lib/api/types';

/**
 * The OMC-048 wiring schedule of §4.3 ("terminal assignment, typical fully-
 * populated station"), row for row. The equipment table and the wiring diagram
 * both read it, so a terminal cannot be DI1 in one and DI2 in the other.
 */
export type WireKind = 'signal' | 'serial' | 'relay' | 'power';

export interface Termination {
  terminal: string;
  device: string;
  interface: string;
  cable: string;
  cores: string;
  kind: WireKind;
  /** The wire's label on the diagram, as Figure 3 writes it. */
  wire: string;
  /** The sensor parameter this termination carries, when it is a sensor. */
  parameter?: ParameterId;
}

export const TERMINALS: Termination[] = [
  { terminal: 'DI1', device: 'RIMCO 7499 rain gauge', interface: 'Digital pulse (reed switch)', cable: '2-core screened', cores: 'tip pulse, 0 V', kind: 'signal', wire: '2-wire pulse', parameter: 'rainfall' },
  { terminal: 'DI2', device: 'RSF80 float switch', interface: 'Volt-free contact (NO/NC)', cable: '2-core screened', cores: 'contact, 0 V (fail-safe)', kind: 'signal', wire: 'NO/NC (fail-safe)', parameter: 'float_switch' },
  { terminal: 'COM1', device: 'Gill WindSonic 75', interface: 'RS-232 / RS-422 serial', cable: '4-core screened', cores: 'Tx, Rx, 0 V, +12 V', kind: 'serial', wire: 'RS-232 / RS-422', parameter: 'wind_mean' },
  { terminal: 'RS-485 A/B', device: 'YGRD-65-D radar level', interface: 'RS-485 Modbus RTU', cable: '2-pair screened', cores: 'A, B, 0 V, +12 V', kind: 'serial', wire: 'RS-485 Modbus RTU', parameter: 'water_level' },
  { terminal: 'SDI-12 / COM2', device: 'Gill GMX300 temp/RH (+ pressure)', interface: 'Digital (SDI-12 / RS-232 / RS-485)', cable: '3–4 core screened', cores: 'data, 0 V, +12 V', kind: 'serial', wire: 'SDI-12 / RS-485', parameter: 'temperature' },
  { terminal: 'DI3', device: 'Pump control panel', interface: 'Volt-free status', cable: '2-core screened', cores: 'run / trip, 0 V', kind: 'signal', wire: 'run / trip' },
  { terminal: 'RO1 / RO2', device: 'Pump panel — duty / standby', interface: 'Relay (volt-free) to contactor coil', cable: '2-core each', cores: 'NO, COM', kind: 'relay', wire: 'relay' },
  { terminal: 'PWR (V+ / 0 V)', device: 'Battery 12 VDC (solar-charged)', interface: 'DC power input', cable: '2-core', cores: '+12 V, 0 V', kind: 'power', wire: '+12 V' },
  { terminal: 'Modem / USB', device: 'Cellular modem (4G / 5G)', interface: 'USB / serial', cable: '—', cores: 'data, power', kind: 'serial', wire: 'modem / USB' },
  { terminal: 'Earth', device: 'Cabinet / mast bond', interface: 'Protective earth', cable: 'earth conductor', cores: 'PE', kind: 'power', wire: 'PE' },
];

export const TERMINAL_FOR: Partial<Record<ParameterId, Termination>> = Object.fromEntries(
  TERMINALS.filter((t) => t.parameter).map((t) => [t.parameter!, t]),
);
