import { Platform } from 'react-native';
import Constants from 'expo-constants';

const DEFAULT_API_URL = 'http://localhost:3000';

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

/** Hostname of the machine running Metro (phone + PC on the same Wi-Fi). */
function metroHostname(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.linkingUri;

  if (!hostUri || typeof hostUri !== 'string') return null;

  const withoutProtocol = hostUri.replace(/^[a-z]+:\/\//i, '');
  const host = withoutProtocol.split('/')[0]?.split(':')[0];
  if (!host || host === 'exp.host') return null;
  return host;
}

export function resolveApiBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ||
    Constants.expoConfig?.extra?.apiBaseUrl ||
    DEFAULT_API_URL;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return configured.replace(/\/$/, '');
  }

  if (Platform.OS === 'web' || !isLoopbackHost(parsed.hostname)) {
    return parsed.origin;
  }

  const packagerHost = metroHostname();
  if (packagerHost && !isLoopbackHost(packagerHost)) {
    parsed.hostname = packagerHost;
    return parsed.origin;
  }

  // Android emulator: the host machine is 10.0.2.2, not localhost
  if (Platform.OS === 'android') {
    parsed.hostname = '10.0.2.2';
    return parsed.origin;
  }

  return parsed.origin;
}

export const API_BASE_URL = resolveApiBaseUrl();

if (__DEV__) {
  console.log(`[KitchenAsty] API_BASE_URL=${API_BASE_URL}`);
}

export const TAX_RATE = 0.08;
export const DEFAULT_DELIVERY_FEE = 4.99;
export const LOYALTY_POINTS_PER_DOLLAR = 100; // 100 points = $1.00
