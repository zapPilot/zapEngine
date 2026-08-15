export const NATIVE_PRIVY_AUTH_COPY = {
  body: 'Continue with email. Authentication is powered by Privy.',
  cta: 'Continue with Privy',
  hint: 'Opens Privy email sign-in',
} as const;

export const NATIVE_PRIVY_PROVIDER_CONFIG = {
  embedded: {
    ethereum: {
      createOnLogin: 'off',
    },
  },
} as const;
