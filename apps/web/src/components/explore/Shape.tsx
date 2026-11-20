import type { ExploreMode } from '../../state/view'
import type { Item } from './stageGeom'

/** One seat as a Map outline (path) or a Hex (polygon). */
export function Shape({ mode, it, ...rest }: { mode: ExploreMode; it: Item } & React.SVGProps<SVGPathElement & SVGPolygonElement>) {
  return mode === 'hex' ? <polygon points={it.geom} {...(rest as React.SVGProps<SVGPolygonElement>)} /> : <path d={it.geom} {...(rest as React.SVGProps<SVGPathElement>)} />
}
