import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Statics } from '../../data/types'
import type { Seat } from '../../derive/seats'
import type { ExploreMode } from '../../state/view'
import { ArrowsThumb, CountedThumb, OneNationThumb, PrefsThumb, SimilarThumb } from './Thumbs'
import { MultiplesThumb } from './multiples/MultiplesThumb'

/** What the host gives every lens: the seats at the time on show (so Rewind applies) and the static layers. */
export interface LensProps {
  seats: Map<number, Seat>
  statics: Statics
  mode: ExploreMode
  /** The lens's question, drawn by the lens's own bar at the top right (VE-123). */
  title: string
  onMode: (m: ExploreMode) => void
  /** Close the lens and select this seat on the main stage (the district panel opens). */
  onShowSeat?: (id: number) => void
}

export interface LensDef {
  /** The ?explore= value. */
  id: string
  /** One plain question: the card's words and the view's heading. */
  question: string
  /** VE-167: the question once every seat is declared, where the night's wording ("will", "tonight") no longer fits. */
  finalQuestion?: string
  Thumb: ComponentType
  /** The shape the lens opens on from the sheet (FB-130: swing opens on Hex). Absent means Map. */
  defaultMode?: ExploreMode
  /** Lazy, so a lens costs nothing until it is opened. */
  Lens: LazyExoticComponent<ComponentType<LensProps>>
}

/**
 * The Explore views (ADR 0022). Adding a lens is one entry here: an id, its question, a small static thumbnail and a
 * lazy import of the component. The sheet's cards, the peek card's thumbnails and ?explore= all read this list.
 */
export const LENSES: readonly LensDef[] = [
  {
    id: 'arrows',
    question: 'Which way did each seat move since 2022?',
    Thumb: ArrowsThumb,
    defaultMode: 'hex',
    Lens: lazy(() => import('./arrows/ArrowsLens')),
  },
  {
    id: 'counted',
    question: 'How much of each seat is counted?',
    // VE-215 A21: at the Final the card asks what the lens then shows (turnout), as the lens's own title does.
    finalQuestion: 'Where was turnout highest?',
    Thumb: CountedThumb,
    Lens: lazy(() => import('./counted/CountedLens')),
  },
  {
    id: 'prefs',
    question: 'Which seats will preferences decide?',
    // VE-193: at Final the lens counts seats under 50% first preferences, not seats where preferences changed the winner.
    finalQuestion: 'How many seats needed preferences?',
    Thumb: PrefsThumb,
    // The locator inset opens on Hex, as before; the toggle in the lens bar switches it to the map (VE-193).
    defaultMode: 'hex',
    Lens: lazy(() => import('./prefs/PrefsLens')),
  },
  {
    id: 'one-nation',
    question: 'Where is each party strongest?',
    Thumb: OneNationThumb,
    Lens: lazy(() => import('./one-nation/OneNationLens')),
  },
  {
    // VE-209, merged with the old Seats-like-this lens in VE-212 (FB-250): the ranks are static, so it is offered from before the
    // first result (no gate in ready.ts). Before results the words give the 2022 holders; after, the counted leaders.
    id: 'similar',
    question: 'How are seats like yours voting?',
    Thumb: SimilarThumb,
    Lens: lazy(() => import('./similar/SimilarLens')),
  },
  {
    // Needs the night so far: offered once enough seats have several ticks (multiReady, read from nightStore by ready.ts).
    id: 'multiples',
    question: 'How did each race move tonight?',
    finalQuestion: 'How did each race move on the night?',
    Thumb: MultiplesThumb,
    defaultMode: 'hex',
    Lens: lazy(() => import('./multiples/MultiplesLens')),
  },
]

/** A lens's question as it should read now: the Final wording once every seat is declared (VE-167), else the night's. */
export const questionOf = (l: LensDef, final: boolean): string => (final && l.finalQuestion ? l.finalQuestion : l.question)
