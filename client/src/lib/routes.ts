const APP_ROOT = "/app";
const ABSOLUTE_PREFIX = "~";

function stripAbsolutePrefix(route: string) {
  return route.startsWith(ABSOLUTE_PREFIX) ? route.slice(ABSOLUTE_PREFIX.length) : route;
}

export const appRoutes = {
  explore: () => `${ABSOLUTE_PREFIX}${APP_ROOT}`,
  chat: () => `${ABSOLUTE_PREFIX}${APP_ROOT}/chat`,
  conversation: (id: number | string) => `${ABSOLUTE_PREFIX}${APP_ROOT}/chat/${id}`,
  courses: () => `${ABSOLUTE_PREFIX}${APP_ROOT}/courses`,
  dashboard: () => `${ABSOLUTE_PREFIX}${APP_ROOT}/dashboard`,
  history: () => `${ABSOLUTE_PREFIX}${APP_ROOT}/history`,
} as const;

export function getCurrentAppPath(location: string) {
  const appRoot = stripAbsolutePrefix(appRoutes.explore());

  if (location === "/") {
    return appRoot;
  }

  return location.startsWith(appRoot) ? location : `${appRoot}${location}`;
}

export function isActiveAppRoute(location: string, route: string) {
  const currentPath = getCurrentAppPath(location);
  const targetPath = stripAbsolutePrefix(route);
  const appRoot = stripAbsolutePrefix(appRoutes.explore());

  return currentPath === targetPath || (targetPath !== appRoot && currentPath.startsWith(targetPath));
}
