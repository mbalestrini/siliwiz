import { createSignal } from 'solid-js';

export const [spiceInput, setSpiceInput] = createSignal<string>('');
export const [minInVoltage, setMinInVoltage] = createSignal<number>(0);
export const [maxInVoltage, setMaxInVoltage] = createSignal<number>(5);

export function processMagicSpice(magicSpice: string) {
  const circuit = magicSpice.match(/\n.subckt ([^\n]*)\n(.+)\n.ends\n/s);
  if (!circuit) {
    return null;
  }

  const signals = circuit[1].split(' ').slice(1);

  return {
    signals,
    netlist: circuit[2],
  };
}

export function spiceFile() {
  const input = processMagicSpice(spiceInput());

  const signals = input?.signals ?? [];
  const netlist = input?.netlist ?? '';

  return `*SiliWiz Simulation

*signals: ${signals?.join(' ')}

Vdd vdd 0 5 ; power supply: 5V
Vss vss 0 0 ; ground

* Input pulse: ramp the \`in\` signal
Vin in 0 pulse (${minInVoltage()} ${maxInVoltage()} 0 50u 50u 1 1)

* Extracted circuit:
${netlist}

* Models:
.model nmos nmos (vto=1 tox=15n uo=600 cbd=20f cbs=20f gamma=0.37)
.model pmos pmos (vto=-1 tox=15n uo=230 cbd=20f cbs=20f gamma=0.37)

* Simulation parameters:
.tran 500n 60u

.end
`;
}
