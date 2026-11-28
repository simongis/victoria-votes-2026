import { describe, expect, it } from 'vitest'
import { centreButtons } from './panelInput'

describe('centreButtons (VE-301)', () => {
  const m = (id: number, name: string, districtId: number) => ({ id, name, districtId, isEvc: true })
  const seats = new Map([[1, 'Essendon'], [2, 'Kororoit']])
  it('labels by district when every record has the same name', () => {
    expect(centreButtons([m(1, 'St Albans - EVC 1', 2), m(2, 'St Albans - EVC 1', 1)], seats).map((b) => b.seat)).toEqual(['Kororoit', 'Essendon'])
  })
  it('adds the place name when the names differ', () => {
    expect(centreButtons([m(1, 'Essendon - EVC 2', 1), m(2, 'Strathmore North', 1)], seats).map((b) => b.seat)).toEqual(['Essendon - EVC 2 (Essendon)', 'Strathmore North (Essendon)'])
  })
})
