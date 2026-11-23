/**
 * T1 · investigate · quiz
 *
 * The first ticket anyone gets: someone reports an address, and you have to turn
 * it into a machine and a person. Nothing is broken — the skill being taught is
 * that an IP address is a lookup key, not a mystery.
 */

import { HOST, USER, NET } from '../world/contract.js';
import { selectDeviceByIp, selectDevicesOnSubnet, selectUsers } from '../../core/world/select.js';

export default {
  id: 'it-001',
  title: 'Who sits at this address?',
  kind: 'investigate',
  domain: 'it',
  engine: 'quiz',
  tier: 1,
  difficulty: 1,
  complexity: 1,

  requires: [],
  teaches: ['ip-addressing', 'cli-ipconfig'],

  reporter: USER.RAVI.name,
  brief:
    `Ravi left a note before going home: the ${NET.HQ_STAFF.label} network logged a licensing error ` +
    `from ${HOST.PC_FINANCE.ip} at 18:40. He wants to know whose desk that is before he calls the vendor ` +
    `in the morning. Find the machine, and find the person who uses it.`,

  debrief:
    `An address is a lookup, not a riddle. Every machine on ${NET.HQ_STAFF.cidr} is recorded, so ` +
    `${HOST.PC_FINANCE.ip} resolves to exactly one host — ${HOST.PC_FINANCE.id} — and that host has ` +
    `exactly one regular user. Two steps, no guessing. You will do this a hundred times.`,

  hints: [
    'The third octet tells you which network it is on. Start by working out which one.',
    'Every device in the asset list has its interfaces recorded. Match the address to one of them.',
    'Once you have the machine, the person is whoever that machine is assigned to.'
  ],

  // Both option lists are read from the world, so the choices on offer are the
  // machines and people that exist right now rather than a list that has to be
  // maintained alongside them.
  props: {
    questions: [
      {
        key: 'deviceId',
        prompt: `Which machine is using ${HOST.PC_FINANCE.ip}?`,
        options: (world) =>
          selectDevicesOnSubnet(world, NET.HQ_STAFF.id)
            .filter((device) => device.kind === 'workstation')
            .map((device) => ({ value: device.id, label: `${device.id} — ${device.label}` }))
      },
      {
        key: 'userId',
        prompt: 'And who works at that machine?',
        options: (world) =>
          selectUsers(world)
            .filter((user) => user.enabled)
            .map((user) => ({ value: user.id, label: `${user.name} — ${user.title}` }))
      }
    ]
  },

  // `win` reads the WORLD; the reference solution answers from the CONTRACT. If
  // those two ever drift apart, this mission fails — which is the point.
  win: (world, ctx) => {
    const found = selectDeviceByIp(world, HOST.PC_FINANCE.ip);
    if (!found) return false;
    return ctx.answers.deviceId === found.device.id && ctx.answers.userId === USER.LENA.id;
  },

  solution: async (api) => {
    api.answer('deviceId', HOST.PC_FINANCE.id);
    api.answer('userId', USER.LENA.id);
  },

  xp: 15
};
