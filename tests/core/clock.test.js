import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EPOCH_ISO,
  toDate,
  toTick,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  formatTime,
  formatStamp,
  formatIso,
  formatLogStamp,
  hourOfDay,
  dayOfWeek,
  isWorkHours,
  describeGap
} from '../../src/core/clock.js';

describe('epoch', () => {
  test('tick 0 is the epoch', () => {
    assert.equal(toDate(0).toISOString(), EPOCH_ISO);
  });

  test('the epoch is a Monday, so shift narratives line up', () => {
    assert.equal(dayOfWeek(0), 1);
  });
});

describe('toTick / toDate round-trip', () => {
  test('converts an ISO timestamp to a tick and back', () => {
    const iso = '2026-03-04T13:45:30.000Z';
    assert.equal(formatIso(toTick(iso)), iso);
  });

  test('ticks are whole seconds since the epoch', () => {
    assert.equal(toTick('2026-03-02T00:01:00.000Z'), 60);
    assert.equal(toTick('2026-03-03T00:00:00.000Z'), 86400);
  });

  test('rejects an unparseable timestamp', () => {
    assert.throws(() => toTick('not a date'), /timestamp/i);
  });
});

describe('arithmetic is pure', () => {
  test('add helpers return new values', () => {
    assert.equal(addSeconds(0, 30), 30);
    assert.equal(addMinutes(0, 2), 120);
    assert.equal(addHours(0, 3), 10800);
    assert.equal(addDays(0, 2), 172800);
  });

  test('accepts negative offsets', () => {
    assert.equal(addHours(10800, -1), 7200);
  });

  test('chains without drift', () => {
    const t = addSeconds(addMinutes(addHours(addDays(0, 1), 2), 3), 4);
    assert.equal(t, 86400 + 7200 + 180 + 4);
    assert.equal(formatStamp(t), '2026-03-03 02:03:04');
  });

  test('rejects a non-finite tick', () => {
    assert.throws(() => addSeconds(Number.NaN, 1), /tick/i);
    assert.throws(() => addSeconds(0, Number.POSITIVE_INFINITY), /amount/i);
  });
});

describe('formatting', () => {
  const tick = toTick('2026-03-05T09:07:03.000Z');

  test('formatTime is zero-padded 24-hour', () => {
    assert.equal(formatTime(tick), '09:07:03');
    assert.equal(formatTime(0), '00:00:00');
  });

  test('formatStamp is a sortable date and time', () => {
    assert.equal(formatStamp(tick), '2026-03-05 09:07:03');
  });

  test('formatIso matches the standard representation', () => {
    assert.equal(formatIso(tick), '2026-03-05T09:07:03.000Z');
  });

  test('formatLogStamp matches the syslog shape used by the log lens', () => {
    assert.equal(formatLogStamp(tick), 'Mar  5 09:07:03');
    assert.equal(formatLogStamp(toTick('2026-03-15T22:00:00.000Z')), 'Mar 15 22:00:00');
  });
});

describe('calendar helpers', () => {
  test('hourOfDay and dayOfWeek read off the tick', () => {
    const tick = toTick('2026-03-07T22:30:00.000Z');
    assert.equal(hourOfDay(tick), 22);
    assert.equal(dayOfWeek(tick), 6);
  });

  test('isWorkHours covers weekday daytime only', () => {
    assert.equal(isWorkHours(toTick('2026-03-04T10:00:00.000Z')), true);
    assert.equal(isWorkHours(toTick('2026-03-04T03:00:00.000Z')), false);
    assert.equal(isWorkHours(toTick('2026-03-07T10:00:00.000Z')), false);
  });
});

describe('describeGap', () => {
  test('renders human-readable durations', () => {
    assert.equal(describeGap(45), '45s');
    assert.equal(describeGap(90), '1m 30s');
    assert.equal(describeGap(3600), '1h');
    assert.equal(describeGap(3725), '1h 2m');
    assert.equal(describeGap(90000), '1d 1h');
  });

  test('handles zero and negative gaps', () => {
    assert.equal(describeGap(0), '0s');
    assert.equal(describeGap(-30), '30s');
  });
});

/* Determinism is enforced across all of core/ by tests/core/purity.test.js. */
