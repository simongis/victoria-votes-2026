import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
import { bucketFor, isClassicPair } from "./parties";

describe("schema v0.1", () => {
  it("has unique field names within each layer", () => {
    for (const layer of Object.values(LAYERS)) {
      const names = layer.fields.map((f) => f.name);
      expect(new Set(names).size, layer.name).toBe(names.length);
    }
  });

  it("includes the key field in each layer", () => {
    for (const layer of Object.values(LAYERS)) {
      expect(layer.fields.some((f) => f.name === layer.keyField), layer.name).toBe(true);
    }
  });

  it("keeps field names within AGOL's safe length", () => {
    for (const layer of Object.values(LAYERS)) {
      for (const f of layer.fields) expect(f.name.length, f.name).toBeLessThanOrEqual(31);
    }
  });

  it("gives districts and seat hexes the same result fields", () => {
    const names = (l: { fields: readonly { name: string }[] }) => new Set(l.fields.map((f) => f.name));
    const seat = names(LAYERS.seat_hexes);
    for (const n of names(LAYERS.districts)) expect(seat.has(n), n).toBe(true);
  });

  it("buckets affiliations", () => {
    expect(bucketFor(5, false)).toBe("ALP");
    expect(bucketFor(null, true)).toBe("IND");
    expect(bucketFor(9999, false)).toBe("OTH");
    expect(isClassicPair("NAT", "ALP")).toBe(true);
    expect(isClassicPair("ALP", "GRN")).toBe(false);
    expect(bucketFor(4, false)).toBe("GRN");
    expect(bucketFor(9, false)).toBe("NAT");
  });
});
