import { describe, expect, it } from 'vitest'
import { forecastBase, forecastHref, forecastSimilarHref, seatLabel, seatSlug } from './forecastLink'

// Our 88 seat names (seatName of district_name) and the slug the forecast site uses as its district id. The slugs were
// checked once, 19 Nov 2026 (VE-200), against that site's own 88 ids: no mismatch either way.
const SEATS: [string, string][] = [
  ['Albert Park', 'albert-park'],
  ['Ashwood', 'ashwood'],
  ['Bass', 'bass'],
  ['Bayswater', 'bayswater'],
  ['Bellarine', 'bellarine'],
  ['Benambra', 'benambra'],
  ['Bendigo East', 'bendigo-east'],
  ['Bendigo West', 'bendigo-west'],
  ['Bentleigh', 'bentleigh'],
  ['Berwick', 'berwick'],
  ['Box Hill', 'box-hill'],
  ['Brighton', 'brighton'],
  ['Broadmeadows', 'broadmeadows'],
  ['Brunswick', 'brunswick'],
  ['Bulleen', 'bulleen'],
  ['Bundoora', 'bundoora'],
  ['Carrum', 'carrum'],
  ['Caulfield', 'caulfield'],
  ['Clarinda', 'clarinda'],
  ['Cranbourne', 'cranbourne'],
  ['Croydon', 'croydon'],
  ['Dandenong', 'dandenong'],
  ['Eildon', 'eildon'],
  ['Eltham', 'eltham'],
  ['Essendon', 'essendon'],
  ['Eureka', 'eureka'],
  ['Euroa', 'euroa'],
  ['Evelyn', 'evelyn'],
  ['Footscray', 'footscray'],
  ['Frankston', 'frankston'],
  ['Geelong', 'geelong'],
  ['Gippsland East', 'gippsland-east'],
  ['Gippsland South', 'gippsland-south'],
  ['Glen Waverley', 'glen-waverley'],
  ['Greenvale', 'greenvale'],
  ['Hastings', 'hastings'],
  ['Hawthorn', 'hawthorn'],
  ['Ivanhoe', 'ivanhoe'],
  ['Kalkallo', 'kalkallo'],
  ['Kew', 'kew'],
  ['Kororoit', 'kororoit'],
  ['Lara', 'lara'],
  ['Laverton', 'laverton'],
  ['Lowan', 'lowan'],
  ['Macedon', 'macedon'],
  ['Malvern', 'malvern'],
  ['Melbourne', 'melbourne'],
  ['Melton', 'melton'],
  ['Mildura', 'mildura'],
  ['Mill Park', 'mill-park'],
  ['Monbulk', 'monbulk'],
  ['Mordialloc', 'mordialloc'],
  ['Mornington', 'mornington'],
  ['Morwell', 'morwell'],
  ['Mulgrave', 'mulgrave'],
  ['Murray Plains', 'murray-plains'],
  ['Narracan', 'narracan'],
  ['Narre Warren North', 'narre-warren-north'],
  ['Narre Warren South', 'narre-warren-south'],
  ['Nepean', 'nepean'],
  ['Niddrie', 'niddrie'],
  ['Northcote', 'northcote'],
  ['Oakleigh', 'oakleigh'],
  ['Ovens Valley', 'ovens-valley'],
  ['Pakenham', 'pakenham'],
  ['Pascoe Vale', 'pascoe-vale'],
  ['Point Cook', 'point-cook'],
  ['Polwarth', 'polwarth'],
  ['Prahran', 'prahran'],
  ['Preston', 'preston'],
  ['Richmond', 'richmond'],
  ['Ringwood', 'ringwood'],
  ['Ripon', 'ripon'],
  ['Rowville', 'rowville'],
  ['Sandringham', 'sandringham'],
  ['Shepparton', 'shepparton'],
  ['South Barwon', 'south-barwon'],
  ['South-West Coast', 'south-west-coast'],
  ['St Albans', 'st-albans'],
  ['Sunbury', 'sunbury'],
  ['Sydenham', 'sydenham'],
  ['Tarneit', 'tarneit'],
  ['Thomastown', 'thomastown'],
  ['Warrandyte', 'warrandyte'],
  ['Wendouree', 'wendouree'],
  ['Werribee', 'werribee'],
  ['Williamstown', 'williamstown'],
  ['Yan Yean', 'yan-yean'],
]

describe('seatSlug', () => {
  it('has all 88 seats, each slug unique', () => {
    expect(SEATS).toHaveLength(88)
    expect(new Set(SEATS.map(([, s]) => s)).size).toBe(88)
  })
  it.each(SEATS)('%s -> %s', (name, slug) => {
    expect(seatSlug(name)).toBe(slug)
  })
  it('drops a trailing District, case and stray spaces', () => {
    expect(seatSlug('  Albert Park District ')).toBe('albert-park')
  })
})

describe('forecastBase', () => {
  it('is null (no card) for a missing or empty value', () => {
    expect(forecastBase(undefined)).toBeNull()
    expect(forecastBase('')).toBeNull()
    expect(forecastBase('   ')).toBeNull()
  })
  it('is null for anything that is not an https address', () => {
    expect(forecastBase('javascript:alert(1)')).toBeNull()
    expect(forecastBase('http://forecast.example/')).toBeNull()
    expect(forecastBase('not a url')).toBeNull()
  })
  it('gives the same address with or without a trailing slash', () => {
    expect(forecastBase('https://forecast.example/')).toBe('https://forecast.example/')
    expect(forecastBase('https://forecast.example')).toBe('https://forecast.example/')
    expect(forecastBase('https://forecast.example/vic')).toBe('https://forecast.example/vic/')
  })
})

describe('forecastHref', () => {
  const base = 'https://forecast.example/'
  it('is the plain address with no seat', () => {
    expect(forecastHref(base, null)).toBe(base)
    expect(forecastHref(base, undefined)).toBe(base)
  })
  // VE-236: the forecast site ignores #seat= on its statewide tab, so a seat link opens the modelling tab with the seat shown.
  it('opens the modelling tab with #seat=<slug> for a seat', () => {
    expect(forecastHref(base, 'Albert Park')).toBe('https://forecast.example/?tab=modelling#seat=albert-park')
    expect(forecastHref('https://forecast.example/vic/', 'St Albans')).toBe('https://forecast.example/vic/?tab=modelling#seat=st-albans')
  })
})

// VE-201: the seat panel line names the seat without the word District.
describe('seatLabel', () => {
  it('drops a trailing District and keeps the seat name', () => {
    expect(seatLabel('Albert Park District')).toBe('Albert Park')
    expect(seatLabel('Ashwood')).toBe('Ashwood')
    expect(seatLabel('  Eureka District ')).toBe('Eureka')
  })
})

describe('forecastSimilarHref (VE-209)', () => {
  it('opens the source map for the seat, on the modelling tab', () => {
    expect(forecastSimilarHref('https://forecast.example/', 'Ripon')).toBe('https://forecast.example/?tab=modelling#seat=ripon')
    expect(forecastSimilarHref('https://forecast.example/', 'Gippsland South District')).toBe('https://forecast.example/?tab=modelling#seat=gippsland-south')
  })
})
