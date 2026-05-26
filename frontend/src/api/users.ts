import client from './client'
import type { User, Me } from '@/types'

export async function getMe(): Promise<Me> {
  const { data } = await client.get('/me')
  return data
}

export async function listUsers(role?: string): Promise<User[]> {
  const { data } = await client.get('/users', { params: role ? { role } : {} })
  return data
}
