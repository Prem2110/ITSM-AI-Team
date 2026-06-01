import client from './client'
import type { Priority, StatesConfig } from '@/types'

export async function getPriorities(): Promise<Priority[]> {
  const { data } = await client.get('/config/priorities')
  return data
}

export async function getCategories(): Promise<string[]> {
  const { data } = await client.get('/config/categories')
  return data
}

export async function getSources(): Promise<string[]> {
  const { data } = await client.get('/config/sources')
  return data
}

export async function getStates(): Promise<StatesConfig> {
  const { data } = await client.get('/config/states')
  return data
}
