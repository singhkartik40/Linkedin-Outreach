import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSchedule, claimSchedule, finishSchedule, INTERVAL } from '../server/discovery-schedule.mjs';
test('automatic discovery is due every hour and cannot overlap', () => {
 const initial = initialSchedule(1000);
 assert.equal(claimSchedule(initial, true, 1001), null);
 const run = claimSchedule(initial, true, 1000 + INTERVAL);
 assert.ok(run.runId);
 assert.equal(run.nextRunAt, 1000 + INTERVAL * 2);
 assert.equal(claimSchedule(run, false, 1001 + INTERVAL), null);
 const finished = finishSchedule(run, run.runId, 'Completed', 20);
 assert.equal(finished.lastAdded, 20);
 assert.equal(finished.leaseUntil, 0);
 assert.equal(finishSchedule(run, 'stale-run', 'Failed'), run);
});
test('pause stops automatic runs; manual runs and abandoned-run recovery remain available', () => {
 const paused = {...initialSchedule(0),enabled:false};
 assert.equal(claimSchedule(paused,true,INTERVAL),null);
 const run = claimSchedule(paused,false,INTERVAL);
 assert.ok(run);
 assert.ok(claimSchedule(run,false,run.leaseUntil+1));
});

test('stopping a scan leaves hourly discovery enabled but prevents an immediate overdue restart', () => {
 const run = claimSchedule(initialSchedule(0), false, 0);
 const stopped = finishSchedule(run, run.runId, 'Stopped by user', 3, INTERVAL + 1000);
 assert.equal(stopped.enabled, true);
 assert.equal(stopped.runId, null);
 assert.equal(stopped.lastAdded, 3);
 assert.equal(stopped.nextRunAt, INTERVAL * 2 + 1000);
 assert.equal(claimSchedule(stopped, true, INTERVAL + 1001), null);
});
