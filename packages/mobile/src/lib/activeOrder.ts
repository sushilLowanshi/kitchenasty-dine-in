import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kitchenasty_active_order_id';

export async function getActiveOrderId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setActiveOrderId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function clearActiveOrderId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
