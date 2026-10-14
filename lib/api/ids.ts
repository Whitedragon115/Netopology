/**
 * Client ids for things created optimistically (features/canvas/sync.ts).
 *
 * Something drawn on the canvas gets an id in the browser right away. When the server answers, the
 * real id is bound to it, and from then on this layer translates in both directions for the whole
 * session: requests are rewritten to the server id, responses back to the client id. The app never
 * sees an id change, so selections, editors and React keys stay stable. A request that mentions an
 * id still being created waits for it (or fails with it).
 */

const toServer = new Map<string, string>();
const toClient = new Map<string, string>();
const waiting = new Map<string, { promise: Promise<string>; resolve: (id: string) => void; reject: (e: unknown) => void }>();

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A random v4 UUID. crypto.randomUUID only exists on https/localhost; self-hosted installs often run on plain http. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A new client id whose server id is not known yet. */
export function tempId(): string {
  const id = uuid();
  let resolve!: (id: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined); // nobody may be waiting; don't report an unhandled rejection
  waiting.set(id, { promise, resolve, reject });
  return id;
}

/** The server answered: `clientId` is `serverId` from now on (also used when undo/redo recreates an item). */
export function bindId(clientId: string, serverId: string) {
  if (clientId === serverId) return;
  const old = toServer.get(clientId);
  if (old) toClient.delete(old);
  toServer.set(clientId, serverId);
  toClient.set(serverId, clientId);
  waiting.get(clientId)?.resolve(serverId);
  waiting.delete(clientId);
}

/** Mark an id as being created again (redo): requests that mention it wait for the new server id. */
export function rebinding(clientId: string) {
  if (waiting.has(clientId)) return;
  let resolve!: (id: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined);
  waiting.set(clientId, { promise, resolve, reject });
}

/** Creating it failed: requests waiting for this id fail too. */
export function failId(clientId: string, error: unknown) {
  waiting.get(clientId)?.reject(error);
  waiting.delete(clientId);
}

export const serverIdOf = (id: string) => toServer.get(id) ?? id;
export const clientIdOf = (id: string) => toClient.get(id) ?? id;
export const isPending = (id: string) => waiting.has(id);

/** Text with every client id replaced by its server id, waiting for ids that are still being created. */
export async function toServerText(text: string): Promise<string> {
  const ids = text.match(UUID);
  if (!ids) return text;
  for (const id of new Set(ids)) {
    const w = waiting.get(id.toLowerCase());
    if (w) await w.promise;
  }
  return toServer.size ? text.replace(UUID, (m) => toServer.get(m.toLowerCase()) ?? m) : text;
}

/** Text with every known server id replaced by its client id. */
export function toClientText(text: string): string {
  return toClient.size ? text.replace(UUID, (m) => toClient.get(m.toLowerCase()) ?? m) : text;
}

/** A parsed response (or anything JSON) seen with client ids: for ids bound after the response was read. */
export function toClientIds<T>(value: T): T {
  return toClient.size ? (JSON.parse(toClientText(JSON.stringify(value))) as T) : value;
}
