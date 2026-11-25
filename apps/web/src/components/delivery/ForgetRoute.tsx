'use client';

import { useEffect } from 'react';
import { forgetRoute } from './offline-store';

/** Link expired or withdrawn: remove the route data this phone kept (names, addresses). */
export function ForgetRoute({ token }: { token: string }) {
  useEffect(() => forgetRoute(token), [token]);
  return null;
}
