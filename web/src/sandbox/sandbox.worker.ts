// Runs the Sandbox solver off the UI thread.
import { solve, type AffineNetwork } from '../solver/pathEquilibration'

export interface SolveRequest { id: number; area: string; network: AffineNetwork; closed: string[] }

self.onmessage = ({ data }: MessageEvent<SolveRequest>) => {
  try {
    self.postMessage({ id: data.id, area: data.area, result: solve(data.network, data.closed) })
  } catch (error) {
    self.postMessage({ id: data.id, area: data.area, error: (error as Error).message })
  }
}
