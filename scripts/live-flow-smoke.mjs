// In-memory BroadcastChannel polyfill for Node smoke tests.
class MemoryBroadcastChannel {
  static channels = new Map();

  constructor(name) {
    this.name = String(name || 'default');
    this.onmessage = null;
    this.closed = false;

    if (!MemoryBroadcastChannel.channels.has(this.name)) {
      MemoryBroadcastChannel.channels.set(this.name, new Set());
    }
    MemoryBroadcastChannel.channels.get(this.name).add(this);
  }

  postMessage(data) {
    if (this.closed) return;
    const listeners = MemoryBroadcastChannel.channels.get(this.name);
    if (!listeners) return;

    for (const listener of listeners) {
      if (listener === this || listener.closed) continue;
      queueMicrotask(() => {
        listener.onmessage?.({ data });
      });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const listeners = MemoryBroadcastChannel.channels.get(this.name);
    if (!listeners) return;
    listeners.delete(this);
    if (listeners.size === 0) {
      MemoryBroadcastChannel.channels.delete(this.name);
    }
  }
}

if (!globalThis.window) globalThis.window = {};
globalThis.window.BroadcastChannel = MemoryBroadcastChannel;
if (!globalThis.crypto?.randomUUID) {
  const { randomUUID } = await import('node:crypto');
  globalThis.crypto = { randomUUID };
}

const { createLiveChannel } = await import('../src/utils/liveChannel.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitFor(predicate, timeoutMs = 1200, stepMs = 10) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tick = () => {
      try {
        if (predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Timeout waiting for expected live message.'));
        return;
      }
      setTimeout(tick, stepMs);
    };

    tick();
  });
}

function createHost(sessionId, snapshotRef) {
  const host = createLiveChannel({
    sessionId,
    role: 'host',
    playerId: 'host-1',
    name: 'Host',
    search: '?transport=local',
  });

  if (!host) {
    throw new Error('Host channel did not initialize in local transport mode.');
  }

  host.onmessage = (event) => {
    const message = event?.data || {};
    if (message.type === 'join') {
      host.postMessage({ type: 'join_ack', sessionId, playerId: message.playerId });
      host.postMessage({
        type: 'sync',
        sessionId,
        phase: snapshotRef.phase,
        currentIndex: snapshotRef.currentIndex,
        lesson: snapshotRef.lesson,
      });
      return;
    }

    if (message.type === 'request_sync') {
      host.postMessage({
        type: 'sync',
        sessionId,
        phase: snapshotRef.phase,
        currentIndex: snapshotRef.currentIndex,
        lesson: snapshotRef.lesson,
      });
    }
  };

  return host;
}

function createStudent(sessionId, playerId, sink) {
  const student = createLiveChannel({
    sessionId,
    role: 'student',
    playerId,
    name: playerId,
    search: '?transport=local',
  });

  if (!student) {
    throw new Error(`Student channel ${playerId} did not initialize.`);
  }

  student.onmessage = (event) => {
    const message = event?.data || {};
    sink.push(message);
  };

  return student;
}

async function run() {
  const sessionId = 'smoke-1234';
  const snapshotRef = {
    phase: 'running',
    currentIndex: 1,
    lesson: { id: 'lesson-1', title: 'Smoke Lesson', blocks: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] },
  };

  const host = createHost(sessionId, snapshotRef);

  const student1Messages = [];
  const student1 = createStudent(sessionId, 'student-1', student1Messages);

  student1.postMessage({ type: 'join', sessionId, playerId: 'student-1', name: 'Ava' });
  student1.postMessage({ type: 'request_sync', sessionId, playerId: 'student-1' });

  await waitFor(() => student1Messages.some((m) => m.type === 'join_ack') && student1Messages.some((m) => m.type === 'sync'));

  const initialSync = student1Messages.find((m) => m.type === 'sync');
  assert(initialSync.currentIndex === 1, 'Initial sync should have currentIndex=1.');

  student1.close();

  snapshotRef.currentIndex = 2;

  const reconnectMessages = [];
  const student1Reconnect = createStudent(sessionId, 'student-1', reconnectMessages);
  student1Reconnect.postMessage({ type: 'request_sync', sessionId, playerId: 'student-1' });

  await waitFor(() => reconnectMessages.some((m) => m.type === 'sync' && m.currentIndex === 2));

  snapshotRef.currentIndex = 3;

  const lateJoinMessages = [];
  const student2 = createStudent(sessionId, 'student-2', lateJoinMessages);
  student2.postMessage({ type: 'join', sessionId, playerId: 'student-2', name: 'Ben' });

  await waitFor(() => lateJoinMessages.some((m) => m.type === 'sync' && m.currentIndex === 3));

  host.close();
  student1Reconnect.close();
  student2.close();

  console.log('[live:smoke] OK - join, reconnect, and late-join sync paths are healthy.');
}

run().catch((error) => {
  console.error('[live:smoke] FAILED');
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
