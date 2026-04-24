// File purpose:
// Shared helpers for opening GET ordering.
// Sends phone users to the GET Mobile app store listing and desktop users to the UAlbany GET web ordering page.

export const GET_WEB_ORDER_URL = "https://get.cbord.com/albany/full/food_home.php";
export const GET_IOS_APP_URL = "https://apps.apple.com/us/app/get-mobile/id844091049";
export const GET_ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=com.cbord.get";

export function getGetMobileLink() {
  if (typeof navigator === "undefined") {
    return GET_WEB_ORDER_URL;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return GET_IOS_APP_URL;
  }

  if (/android/.test(userAgent)) {
    return GET_ANDROID_APP_URL;
  }

  return GET_WEB_ORDER_URL;
}

export function openGetMobile() {
  const url = getGetMobileLink();
  window.open(url, "_blank", "noopener,noreferrer");
}
