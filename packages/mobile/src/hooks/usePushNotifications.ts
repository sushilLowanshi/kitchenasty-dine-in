import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { authApi } from '../api/endpoints';
import { useAuthStore } from '../store/auth.store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    registerForPushNotifications().then((pushToken) => {
      if (pushToken) {
        setExpoPushToken(pushToken);
        // Save to server if logged in
        if (token) {
          authApi.savePushToken(pushToken).catch(() => {});
        }
      }
    });

    // Foreground notification listener
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Notification received while app is in foreground — no action needed
    });

    // Notification tap listener — deep link to order
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.orderId) {
        router.push(`/orders/${data.orderId}`);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [token, router]);

  return { expoPushToken };
}

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  // Expo push tokens need a real EAS UUID. A placeholder like "your-project-id"
  // makes the CLI demand an Expo login and fails at runtime — skip until EAS is configured.
  const isEasUuid =
    typeof projectId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      projectId,
    );
  if (!isEasUuid) {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return tokenData.data;
}
