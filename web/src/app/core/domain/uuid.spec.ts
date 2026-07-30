import { nameUuidFromBytes, randomUuid } from './uuid';

// Fixtures generated from the same algorithm Java's UUID.nameUUIDFromBytes
// uses (MD5 + version 3 / IETF variant bits). A recurring occurrence's id is
// derived this way on both clients, so any drift here silently breaks
// cross-device dedupe — that is what these pin down.
describe('nameUuidFromBytes', () => {
  it('matches Java for a series/fire-time name', () => {
    expect(nameUuidFromBytes('s1:1767225600000')).toBe('37ba24fc-bb51-36da-886b-afe9ce808fd2');
  });

  it('matches Java for the empty name', () => {
    expect(nameUuidFromBytes('')).toBe('d41d8cd9-8f00-3204-a980-0998ecf8427e');
  });

  it('matches Java for a plain title', () => {
    expect(nameUuidFromBytes('take out trash')).toBe('da668c88-f3c0-3f83-af60-c4f452994d5a');
  });

  it('matches Java for multi-byte UTF-8', () => {
    expect(nameUuidFromBytes('café ☕ tarefa')).toBe('6e6bf12b-961e-3ae5-964f-dd7577c177ce');
  });

  it('matches Java across a multi-block input', () => {
    expect(nameUuidFromBytes('a'.repeat(200))).toBe('887f30b4-3b28-37f4-a9ac-cceee7d16e6c');
  });

  it('is deterministic', () => {
    expect(nameUuidFromBytes('series:42')).toBe(nameUuidFromBytes('series:42'));
  });
});

describe('randomUuid', () => {
  it('mints distinct version 4 uuids', () => {
    const a = randomUuid();
    const b = randomUuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
