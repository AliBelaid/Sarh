export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
  // Local helper service that exposes /nfc/* on a dev port. Used when
  // the browser doesn't grant WebUSB to the page (most desktop installs).
  // The helper talks to the ACR122U over PC/SC and returns the encoded
  // SUN URL ready to be written to the chip.
  nfcHelperUrl: 'http://localhost:9090',
  supabase: {
    url: 'https://rfmozdgpiaeopeqkkglf.supabase.co',
    anonKey: 'sb_publishable_yuOvAyOAh9fNAX5FtBkFYA_t41vZ9Ql',
  },
};
