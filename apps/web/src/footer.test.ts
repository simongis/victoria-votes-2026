import { describe, expect, it } from 'vitest'
import { DECLARED_NOTICE, PROVISIONAL_NOTICE, PROVISIONAL_SHORT, VEC_ATTRIBUTION } from './footer'

describe('attribution wording (ADR 0017)', () => {
  it('uses the VEC suggested attribution verbatim', () => {
    expect(VEC_ATTRIBUTION).toBe('Data sourced from the Victorian Electoral Commission')
  })
  it('states results are provisional and names the source', () => {
    expect(PROVISIONAL_NOTICE).toBe('Provisional. Data sourced from the Victorian Electoral Commission.')
  })
  it('says declared once every seat is, keeping the attribution verbatim (VE-226, finding 12)', () => {
    expect(DECLARED_NOTICE).toBe('Declared results. Data sourced from the Victorian Electoral Commission.')
  })
  it('has the short form for exports', () => {
    expect(PROVISIONAL_SHORT).toBe('Provisional, source: VEC')
  })
})
