import { jwtVerify, createRemoteJWKSet } from 'jose'

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export async function verifyFirebaseToken(
  token: string,
  projectId: string
): Promise<{ email: string } | null> {
  try {
    const JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })

    return { email: (payload['email'] as string) ?? '' }
  } catch {
    return null
  }
}
