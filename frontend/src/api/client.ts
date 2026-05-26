import axios from 'axios'
import { getFakeUser } from './auth'

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.request.use((config) => {
  const fakeUser = getFakeUser()
  if (fakeUser) {
    config.headers['X-Fake-User'] = fakeUser
  }
  // TODO: real XSUAA — add Authorization: Bearer token here
  return config
})

export default client
