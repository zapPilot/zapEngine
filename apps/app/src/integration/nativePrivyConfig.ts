export const NATIVE_PRIVY_AUTH_COPY = {
  body: 'Continue with email. Authentication and your embedded wallet are powered by Privy.',
  cta: 'Continue with Privy',
  hint: 'Opens Privy email sign-in',
} as const;

export const NATIVE_PRIVY_PROVIDER_CONFIG = {
  embedded: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
} as const;
