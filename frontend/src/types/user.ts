export interface User {
  id: string
  email: string
  name: string
  role: 'requester' | 'agent' | 'admin'
  active: boolean
  created_at: string
  updated_at: string
}

export interface Me {
  user_id: string
  email: string
  name: string
  scopes: string[]
}
