// ADR 0017 (amending hard rule 2): the provisional notice and the VEC attribution live in the info sheet behind "i",
// which is always visible. The page itself carries no attribution line; the replay or trial marker stays on screen.
/** The VEC's own suggested wording, kept verbatim. */
export const VEC_ATTRIBUTION = 'Data sourced from the Victorian Electoral Commission'
export const PROVISIONAL_NOTICE = `Provisional. ${VEC_ATTRIBUTION}.`
/** VE-226 (finding 12): once every seat is declared, "Provisional" beside "has won" jars; the attribution stays verbatim. */
export const DECLARED_NOTICE = `Declared results. ${VEC_ATTRIBUTION}.`
/** The short form for any shared image or export, so the label travels with a screenshot of the viz. */
export const PROVISIONAL_SHORT = 'Provisional, source: VEC'
