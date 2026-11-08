/**
 * WarWick Browser - Built-in Privacy Shield & Ad/Tracker Blocker
 * Inspired by Strawberry's NavigationFilterWorker
 *
 * The shield must be attached to every session partition the app uses:
 *  - the default session (the browser shell itself),
 *  - the persistent browsing partition used by tabs,
 *  - the isolated partition used by the background researcher.
 */

import { session } from 'electron';
import { SESSION_PARTITIONS as SHARED_SESSION_PARTITIONS } from '../shared/types';

const SESSION_PARTITIONS = SHARED_SESSION_PARTITIONS || {
  BROWSING: 'persist:warwick-browsing',
  RESEARCH: 'persist:warwick-research-isolated'
};

/** Blocked hosts (matches the host and all of its subdomains). */
const BLOCKED_HOSTS = [
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'adservice.google.com',
  'adnxs.com',
  'ads.pubmatic.com',
  'criteo.com',
  'criteo.net',
  'scorecardresearch.com',
  'quantserve.com',
  'outbrain.com',
  'taboola.com',
  'amazon-adsystem.com',
  'rubiconproject.com',
  'popads.net',
  'coinhive.com',
  'cryptoloot.pro',
  'analytics.twitter.com'
];

/**
 * URL-fragment rules. These are matched against "host + pathname" so rules
 * such as connect.facebook.net/en_us/fbevents.js actually work.
 */
const BLOCKED_URL_FRAGMENTS = [
  'connect.facebook.net/en_us/fbevents.js',
  'facebook.com/tr',
  'google-analytics.com/collect',
  'googletagmanager.com/gtm.js'
];

/**
 * Permission requests that are safe for a normal browsing session.
 * Everything else (camera, microphone, geolocation, notifications, MIDI,
 * clipboard reads, ...) is denied by default.
 */
const ALLOWED_PERMISSIONS = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write'
]);

function isBlockedUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const hostMatches = BLOCKED_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  if (hostMatches) {
    return true;
  }

  const hostAndPath = `${host}${parsed.pathname.toLowerCase()}`;
  return BLOCKED_URL_FRAGMENTS.some((fragment) => hostAndPath.includes(fragment));
}

export function setupPrivacyShield(): void {
  const partitions: Array<string | undefined> = [
    undefined, // default session
    SESSION_PARTITIONS.BROWSING,
    SESSION_PARTITIONS.RESEARCH
  ];

  let attached = 0;

  for (const partition of partitions) {
    try {
      const targetSession = partition ? session.fromPartition(partition) : session.defaultSession;
      if (!targetSession) continue;

      targetSession.webRequest.onBeforeRequest(
        { urls: ['*://*/*'] },
        (details, callback) => {
          callback({ cancel: isBlockedUrl(details.url) });
        }
      );

      // Deny sensitive permissions by default on every browser partition.
      // The shell only needs clipboard writes and fullscreen/pointer lock.
      targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(ALLOWED_PERMISSIONS.has(permission));
      });
      targetSession.setPermissionCheckHandler((_webContents, permission) => {
        return ALLOWED_PERMISSIONS.has(permission);
      });

      attached += 1;
    } catch (err) {
      console.warn(`[PrivacyShield] Failed to attach to partition "${partition || 'default'}":`, err);
    }
  }

  console.log(
    `[PrivacyShield] Ad & tracker protection active on ${attached} session(s) with`,
    BLOCKED_HOSTS.length + BLOCKED_URL_FRAGMENTS.length,
    'signatures.'
  );
}
