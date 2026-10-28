import { randomUUID } from 'node:crypto';
export const INTERVAL = 2 * 60 * 60 * 1000;
const LEASE = 15 * 60 * 1000;
export function initialSchedule(now = Date.now()) { return { enabled: true, nextRunAt: now + INTERVAL, lastRunAt: null, lastFinishedAt: null, lastStatus: 'Not run yet', lastAdded: 0, runId: null, leaseUntil: 0 }; }
export function claimSchedule(schedule, automatic, now = Date.now()) {
 if (schedule.leaseUntil > now || (automatic && (!schedule.enabled || schedule.nextRunAt > now))) return null;
 return { ...schedule, runId: randomUUID(), leaseUntil: now + LEASE, lastRunAt: now, nextRunAt: now + INTERVAL, lastStatus: 'Running' };
}
export function finishSchedule(schedule, runId, status, added = 0, now = Date.now()) {
 if (!runId || schedule.runId !== runId) return schedule;
 return { ...schedule, runId: null, leaseUntil: 0, lastFinishedAt: now, lastStatus: String(status).slice(0,500), lastAdded: Math.max(0, Math.min(50, Number(added) || 0)) };
}
