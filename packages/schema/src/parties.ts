// Party buckets: fixed first-preference columns on every map layer (SCHEMA.md, choice 1).
export const PARTY_BUCKETS = ["ALP", "LIB", "NAT", "GRN", "ONP", "IND", "OTH"] as const;
export type PartyBucket = (typeof PARTY_BUCKETS)[number];

// VEC AffiliationIdentifier Id -> bucket. Ids 5, 8, 88 seen in SE26 samples and SE22; 4 and 9 from SE22.
// complete from the party affiliation file published 10 Nov (VE-16).
export const AFFILIATION_TO_BUCKET: Readonly<Record<number, PartyBucket>> = {
  4: "GRN", // Australian Greens - Victoria (SE22)
  5: "ALP", // Australian Labor Party - Victorian Branch
  8: "LIB", // Liberal Party of Australia - Victorian Division
  9: "NAT", // The Nationals (SE22)
  88: "ONP", // Pauline Hanson's One Nation
};

export function bucketFor(affiliationId: number | null, independent: boolean): PartyBucket {
  if (independent || affiliationId === null) return "IND";
  return AFFILIATION_TO_BUCKET[affiliationId] ?? "OTH";
}

/** Classic contest: Labor against the Coalition (CONTEXT.md). */
export function isClassicPair(a: PartyBucket, b: PartyBucket): boolean {
  const coalition = (p: PartyBucket) => p === "LIB" || p === "NAT";
  return (a === "ALP" && coalition(b)) || (b === "ALP" && coalition(a));
}
