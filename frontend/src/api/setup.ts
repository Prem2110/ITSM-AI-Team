import client from './client'

export interface SetupStatus {
  completed: boolean
  company_name: string | null
}

export interface AdminBootstrap {
  name: string
  email: string
}

export interface SetupCompleteRequest {
  company_name: string
  timezone: string
  admin: AdminBootstrap
  sla_targets: Record<string, number>
  categories: string[]
  sources?: string[]
  resolution_codes: string[]
}

export interface AppSettingsData {
  id: string
  company_name: string
  timezone: string
  sla_targets: Record<string, number> | null
  resolution_codes: string[] | null
  categories: string[] | null
  sources: string[] | null
  ai_enabled: number | null
  openrouter_model: string | null
  setup_completed_at: string
  setup_completed_by: string | null
  created_at: string
  updated_at: string
}

export interface AppSettingsPatch {
  company_name?: string
  timezone?: string
  sla_targets?: Record<string, number>
  resolution_codes?: string[]
  categories?: string[]
  sources?: string[]
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const r = await client.get<SetupStatus>('/setup/status')
  return r.data
}

export async function completeSetup(
  req: SetupCompleteRequest,
): Promise<{ completed: boolean; admin: { id: string; email: string; name: string; role: string } }> {
  const r = await client.post('/setup/complete', req)
  return r.data
}

export async function getAppSettings(): Promise<AppSettingsData> {
  const r = await client.get<AppSettingsData>('/settings')
  return r.data
}

export async function patchAppSettings(fields: AppSettingsPatch): Promise<AppSettingsData> {
  const r = await client.patch<AppSettingsData>('/settings', fields)
  return r.data
}
