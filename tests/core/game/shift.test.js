/**
 * The shift clock.
 *
 * Small, but it is the one number on screen that could tempt someone into
 * reading the real time — which would put `Date.now()` into a build whose entire
 * determinism story rests on not having it. These tests pin it to being a pure
 * function of work done.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  shiftClock,
  shiftPhase,
  SHIFT_START_MINUTES,
  SHIFT_LENGTH_MINUTES,
  MINUTES_PER_TICKET
} from '../../../src/core/game/shift.js';

describe('the shift clock', () => {
  test('a shift that has not started reads as the start time', () => {
    assert.equal(shiftClock(0).label, '22:00');
    assert.equal(shiftClock(0).minutes, SHIFT_START_MINUTES);
    assert.equal(shiftClock(0).elapsed, 0);
  });

  test('each closed ticket moves it on', () => {
    assert.equal(shiftClock(1).label, '22:25');
    assert.equal(shiftClock(2).label, '22:50');
    assert.equal(shiftClock(1).elapsed, MINUTES_PER_TICKET);
  });

  test('it rolls past midnight rather than reading 25:00', () => {
    const past = shiftClock(Math.ceil((2 * 60 + 30) / MINUTES_PER_TICKET));
    assert.match(past.label, /^0[0-9]:[0-5][0-9]$/, `rolled to ${past.label}`);
  });

  test('it never leaves the twenty-four hour clock, however long the night', () => {
    for (let closed = 0; closed < 500; closed++) {
      const { label, minutes } = shiftClock(closed);
      assert.ok(minutes >= 0 && minutes < 24 * 60, `${closed} tickets gave ${minutes} minutes`);
      assert.match(label, /^([01][0-9]|2[0-3]):[0-5][0-9]$/, `${closed} tickets gave "${label}"`);
    }
  });

  test('the remaining time runs down and stops at zero', () => {
    assert.equal(shiftClock(0).remaining, SHIFT_LENGTH_MINUTES);
    assert.equal(shiftClock(1).remaining, SHIFT_LENGTH_MINUTES - MINUTES_PER_TICKET);
    assert.equal(shiftClock(9999).remaining, 0);
    assert.equal(shiftClock(9999).overrun, true);
  });

  test('nonsense input reads as the start of the shift rather than NaN', () => {
    for (const bad of [undefined, null, NaN, -5, Infinity, 'three', {}]) {
      const clock = shiftClock(bad);
      assert.equal(clock.label, '22:00', `${String(bad)} gave ${clock.label}`);
      assert.ok(Number.isFinite(clock.minutes));
    }
  });

  test('a fractional count is floored rather than producing a fractional minute', () => {
    assert.equal(shiftClock(2.9).label, shiftClock(2).label);
  });

  test('it is a pure function of the count', () => {
    assert.deepEqual(shiftClock(4), shiftClock(4));
  });

  test('the phase names the part of the night and always says something', () => {
    for (let closed = 0; closed < 40; closed++) {
      const phase = shiftPhase(closed);
      assert.ok(typeof phase === 'string' && phase.length > 0, `${closed} tickets gave no phase`);
    }
    assert.equal(shiftPhase(0), 'Early');
    assert.equal(shiftPhase(9999), 'Handover');
  });
});
