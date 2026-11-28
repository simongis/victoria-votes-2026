import type { ReactNode } from 'react'
import { InfoButton } from '../InfoButton'
import { nightWords } from '../../derive/nightWords'
import { usePhoneBits } from '../../state/phoneBits'

/**
 * VE-308 (Simon, round 2 pick B4): the map key button's face, the same in every view: Carbon's Information outline (a thin
 * ring with a sans "i"; IBM Carbon, Apache 2.0, information.svg, path copied verbatim) and the words "Map key".
 */
export function MapKeyFace() {
  return (
    <>
      <svg className="map-key__icon" viewBox="0 0 32 32" width="18" height="18" aria-hidden focusable="false">
        <polygon points="17 22 17 14 13 14 13 16 15 16 15 22 12 22 12 24 20 24 20 22 17 22" />
        <path d="M16,8a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,16,8Z" />
        <path d="M16,30A14,14,0,1,1,30,16,14,14,0,0,1,16,30ZM16,4A12,12,0,1,0,28,16,12,12,0,0,0,16,4Z" />
      </svg>
      <span className="stage-info__text" aria-hidden>Map key</span>
    </>
  )
}

/**
 * VE-303 (Simon, 28 Nov): "an info in the top right corner of every map, to explain what the map does". One button in the
 * same corner of the stage and of every lens; VE-308 gave it the "Map key" face. The header's About is the app's own sheet.
 */
export function StageInfo({ label = 'Map key', children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <InfoButton
      label={label}
      align="right"
      className={`stage-info${className ? ` ${className}` : ''}`}
      face={<MapKeyFace />}
    >
      {children}
    </InfoButton>
  )
}

/**
 * The stage's sheet on Map and Hex: the not-live line, the illustrated colour legend, the tick and the striped "no figures"
 * (map marks), when seats settle. VE-307: the provisional notice and
 * the VEC source live in the header's About only, which every view keeps reachable.
 */
export function MapInfo({ colourInfo, final, marksDrawn, dataLabel, sourceNote, notes }: { colourInfo: ReactNode; /** VE-307 fix: the race to 45 and the fold-away detail (CountNotes) on the Leader map, where About used to carry them on a desktop. */ notes?: ReactNode; /** Where the figures come from ("Replay of the 2022 count"), beside the notice as in About. */ sourceNote?: string | null; /** Every seat is declared (VE-166): no tick is drawn, so none is explained. */ final?: boolean; /** The legend art already draws the tick and the stripes (Leader), or the seats are quiet under the dots (Polling places). */ marksDrawn?: boolean; /** Replay or Trial: the sheet says what the marker beside the title means (VE-254). */ dataLabel?: string | null }) {
  const { stillLine } = usePhoneBits()
  return (
    <StageInfo>
      {dataLabel === 'Trial' && <p className="key__trial" data-testid="info-trial"><b>Trial:</b> this is test data, not real results.</p>}
      {dataLabel === 'Replay' && <p className="key__trial" data-testid="info-replay"><b>{nightWords('Replay')!.infoLead}</b> {nightWords('Replay')!.infoLine}.</p>}
      {stillLine && (
        <div className="key__counts" data-testid="info-counts">
          <p data-testid="info-still">{stillLine}</p>
        </div>
      )}
      <div className="key__colour" data-testid="colour-info">{colourInfo}</div>
      {!final && <p data-testid="info-settle">Most seats are clear on the night; close ones can take weeks.</p>}
      {!final && !marksDrawn && (
        <ul className="key">
          <li><span className="key__tick" aria-hidden>&#10003;</span> Declared by the VEC</li>
          <li><span className="sq sq--none" /> No figures yet</li>
        </ul>
      )}
      {notes}
      {sourceNote && <p>{sourceNote}</p>}
    </StageInfo>
  )
}
