/**
 * Shared registry for active room codes.
 * Imported by both index.ts (to create/query codes) and KhamTongHamRoom (to release on dispose).
 */
export const activeRoomCodes = new Set<string>();
