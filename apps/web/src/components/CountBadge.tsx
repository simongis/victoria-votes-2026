/**
 * VE-308 (Simon, round 2 pick A): a chip's count drawn as a small badge, so "Changed hands (31)" reads as a label plus a
 * number. The brackets stay in the text at zero size: a clipped (sr-only) or inline-block span makes Chrome pad the
 * accessible name and innerText with spaces ("Close seats ( 31 )"), which would change every chip's name.
 */
export function CountBadge({ n }: { n: number }) {
  return (
    <>
      {' '}
      <span className="chip__n">
        <span className="chip__br">(</span>
        {n}
        <span className="chip__br">)</span>
      </span>
    </>
  )
}
