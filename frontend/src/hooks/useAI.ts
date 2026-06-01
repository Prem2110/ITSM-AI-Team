import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAIStatus, getSLARisk, getAnomalies, getForecast,
  getAgentWorkload, classifyIncident, getSimilarIncidents, patchAISettings, testConnection,
} from '@/api/ai'
import type { AISettingsPatch } from '@/api/ai'

const STALE_AI = 60 * 1000

export function useAIStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: getAIStatus, staleTime: STALE_AI })
}

export function useSLARisk() {
  return useQuery({ queryKey: ['ai-sla-risk'], queryFn: getSLARisk, staleTime: STALE_AI })
}

export function useAnomalies() {
  return useQuery({ queryKey: ['ai-anomalies'], queryFn: getAnomalies, staleTime: 30 * 1000 })
}

export function useForecast() {
  return useQuery({ queryKey: ['ai-forecast'], queryFn: getForecast, staleTime: 5 * 60 * 1000 })
}

export function useAgentWorkload() {
  return useQuery({ queryKey: ['ai-agent-workload'], queryFn: getAgentWorkload, staleTime: STALE_AI })
}

export function useSimilarIncidents(incidentId: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-similar', incidentId],
    queryFn: () => getSimilarIncidents(incidentId),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useClassifyIncident() {
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description: string }) =>
      classifyIncident(title, description),
  })
}

export function useTestConnection() {
  return useMutation({ mutationFn: testConnection })
}

export function usePatchAISettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: AISettingsPatch) => patchAISettings(fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-status'] })
      qc.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}
