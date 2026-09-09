// Reserved for dashboard test links. Test requests never create an app grant.
export const CONSENT_TEST_STATE_PREFIX = 'utilint-test_';
export function isConsentTest(oauthQuery: string) {
  return (
    new URLSearchParams(oauthQuery).get('state')?.startsWith(CONSENT_TEST_STATE_PREFIX) ?? false
  );
}
