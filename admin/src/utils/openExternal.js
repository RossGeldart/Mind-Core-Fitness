import { Capacitor } from '@capacitor/core';

/**
 * Opens a URL in the system in-app browser on native,
 * or in a new tab on web.
 */
export async function openExternal(url) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
