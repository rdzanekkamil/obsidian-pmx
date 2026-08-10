import type { Project, Task, ProjectPatch } from '../types'

export interface ApiError {
  error: string
  detail?: string
}

export type { Project, Task, ProjectPatch }
