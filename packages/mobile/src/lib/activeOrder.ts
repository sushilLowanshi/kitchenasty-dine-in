import AsyncStorage from '@react-native-async-storage/async-storage';

const IDS_KEY = 'kitchenasty_active_order_ids';
const LEGACY_KEY = 'kitchenasty_active_order_id';

async function readIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))];
      }
    }
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

async function writeIds(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  try {
    if (unique.length === 0) {
      await AsyncStorage.multiRemove([IDS_KEY, LEGACY_KEY]);
      return;
    }
    await AsyncStorage.setItem(IDS_KEY, JSON.stringify(unique));
    await AsyncStorage.setItem(LEGACY_KEY, unique[0]);
  } catch {
    /* ignore */
  }
}

export async function getActiveOrderIds(): Promise<string[]> {
  return readIds();
}

export async function getActiveOrderId(): Promise<string | null> {
  const ids = await readIds();
  return ids[0] ?? null;
}

export async function setActiveOrderId(id: string): Promise<void> {
  await writeIds([id]);
}

export async function addActiveOrderId(id: string): Promise<void> {
  await writeIds([...(await readIds()), id]);
}

export async function setActiveOrderIds(ids: string[]): Promise<void> {
  await writeIds(ids);
}

export async function clearActiveOrderId(): Promise<void> {
  await writeIds([]);
}
