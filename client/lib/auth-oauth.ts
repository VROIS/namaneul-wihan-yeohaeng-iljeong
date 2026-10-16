export type GoogleAuthResponse = {
  type: string;
  params?: { id_token?: string };
  authentication?: { idToken?: string };
} | null;

export type GoogleAuthRequestTuple = [
  unknown,
  GoogleAuthResponse,
  () => Promise<unknown>,
];

export function getIdTokenFromGoogleResponse(
  response: GoogleAuthResponse,
): string | null {
  if (!response || response.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
