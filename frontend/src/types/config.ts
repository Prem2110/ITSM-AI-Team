export interface Priority {
  level: 0 | 1 | 2 | 3 | 4
  name: string
  color: string
  sla_hours: number
}

export interface StatesConfig {
  states: string[]
  transitions: Record<string, string[]>
}

export interface AppConfig {
  priorities: Priority[]
  categories: string[]
  states: StatesConfig
}
