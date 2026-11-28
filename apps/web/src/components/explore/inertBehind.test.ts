import { describe, expect, it } from 'vitest'
import { inertBehind } from './inertBehind'

const build = () => {
  document.body.innerHTML = `
    <div class="app">
      <header class="band"><h1 id="title">T</h1><span id="about" data-keep-live><button>About</button></span><div id="tl">bar</div></header>
      <div class="workspace">
        <div class="stage"><div id="map">map</div><div id="lens">lens</div></div>
        <aside id="rail">rail</aside>
      </div>
    </div>`
  return document.getElementById('lens')!
}

describe('inertBehind (VE-104, VE-307)', () => {
  it('makes everything behind the lens inert but keeps the About live', () => {
    const lens = build()
    const behind = inertBehind(lens)
    const ids = behind.map((e) => e.id || e.className)
    expect(ids).toEqual(expect.arrayContaining(['map', 'rail', 'title', 'tl']))
    // The band itself is not made inert, or the About inside it would be too.
    expect(ids).not.toContain('band')
    expect(ids).not.toContain('about')
    expect(behind).not.toContain(lens)
  })

  it('makes a whole sibling inert when it holds nothing to keep', () => {
    const lens = build()
    document.getElementById('about')!.removeAttribute('data-keep-live')
    const ids = inertBehind(lens).map((e) => e.id || e.className)
    expect(ids).toContain('band')
  })
})
