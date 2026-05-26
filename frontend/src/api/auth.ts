const STORAGE_KEY = 'itsm_fake_user'

export function getFakeUser(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setFakeUser(email: string): void {
  localStorage.setItem(STORAGE_KEY, email)
}

export function clearFakeUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  return !!getFakeUser()
}

// TODO: real XSUAA path — use Authorization: Bearer <token> from SAP BTP OIDC flow
