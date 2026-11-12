import { env } from '../../config/env';

export interface User {
  email: string;
  password: string;
}

/**
 * Test accounts. Credentials come from the environment (e2e-appium/.env
 * locally, secrets on CI) — never from source control.
 */
export const users = {
  get customer(): User {
    return { email: env.credentials.email, password: env.credentials.password };
  },
};
