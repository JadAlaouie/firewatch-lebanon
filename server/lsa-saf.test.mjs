import { describe, expect, it } from 'vitest';
import { fetchLsaSafStatus, parseLsaSafCapabilities } from './lsa-saf.mjs';

const capabilities = `
  <Layer>
    <Dimension name="time" units="ISO8601" default="2026-07-20T06:30:00Z">
      2025-07-25T01:10:00Z/2026-07-20T06:30:00Z/PT10M
    </Dimension>
  </Layer>`;

describe('official LSA SAF status', () => {
  it('reads the latest MTG-FRP slot from WMS capabilities', () => {
    expect(parseLsaSafCapabilities(capabilities)).toBe('2026-07-20T06:30:00.000Z');
  });

  it('marks an official feed beyond the allowed latency as stale', async () => {
    const result = await fetchLsaSafStatus({
      now: Date.parse('2026-07-20T07:31:00Z'),
      maxLagMs: 60 * 60 * 1000,
      requestText: async () => ({ ok: true, status: 200, body: capabilities }),
    });
    expect(result.stale).toBe(true);
    expect(result.lagMs).toBe(61 * 60 * 1000);
  });

  it('rejects a missing time dimension and an implausible future slot', async () => {
    expect(() => parseLsaSafCapabilities('<WMS_Capabilities />')).toThrow(/time dimension/);
    await expect(fetchLsaSafStatus({
      now: Date.parse('2026-07-20T06:00:00Z'),
      requestText: async () => ({ ok: true, status: 200, body: capabilities }),
    })).rejects.toThrow(/server clock/);
  });
});
