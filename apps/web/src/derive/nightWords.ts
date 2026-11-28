import { REPLAY_LABEL } from '../replayLabel'

/**
 * VE-295: the words that mark replay, trial and simulated data (hard rule 2), in one place. A simulated night (the replay
 * folder's manifest has a `simulation` block) must say it is made up from polls, never "Replay: 2022"; the 2022 replay
 * keeps its wording. The manifest is read once when the replay source loads, so the words follow the data, not the folder name.
 */
export interface Simulation {
  /** The manifest names the final-week poll average (VE-267). */
  finalPolls: boolean
}

interface ManifestBits {
  source?: string
  simulation?: { model?: { file?: string } } | null
}

export function simulationOf(m: ManifestBits): Simulation | null {
  if (!m.simulation) return null
  const text = `${m.source ?? ''} ${m.simulation.model?.file ?? ''}`
  return { finalPolls: /final[- ]week/i.test(text) }
}

let current: Simulation | null = null
export const setSimulation = (s: Simulation | null): void => {
  current = s
}
export const getSimulation = (): Simulation | null => current

export interface NightWords {
  /** Header badge: `more` hides on a phone, so the short form is lead + tail. */
  badge: { lead: string; more: string; tail: string }
  /** The notice on a lens body or the polling places. */
  marker: string
  /** The small pill on the booth panel. */
  pill: string
  /** The bold lead of the "i" line, and the rest of the line. */
  infoLead: string
  infoLine: string
}

export function nightWords(label: 'Replay' | 'Trial' | 'Not live' | null, sim: Simulation | null = current): NightWords | null {
  if (label === null) return null
  if (label === 'Replay') {
    if (sim) {
      return {
        badge: { lead: 'Simulated', more: sim.finalPolls ? ' from final polls' : ' from polls', tail: ', not live' },
        marker: 'Simulated night from polls, not live results',
        pill: 'Simulated',
        infoLead: 'Simulated:',
        infoLine: 'made-up results from polls, not live',
      }
    }
    return {
      badge: { lead: 'Replay', more: `: ${REPLAY_LABEL}`, tail: '' },
      marker: 'Replay of the 2022 count, not live results',
      pill: 'Replay of 2022',
      infoLead: 'Replay:',
      infoLine: REPLAY_LABEL,
    }
  }
  if (label === 'Trial') {
    return { badge: { lead: 'Trial', more: ': not real results', tail: '' }, marker: 'Trial data, not live results', pill: 'Trial data', infoLead: 'Trial:', infoLine: 'this is test data, not real results' }
  }
  return { badge: { lead: 'Not live', more: ': not real results', tail: '' }, marker: 'Not live results', pill: 'Not live', infoLead: 'Not live:', infoLine: 'not real results' }
}
