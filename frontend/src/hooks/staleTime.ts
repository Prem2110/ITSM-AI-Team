const m = 60 * 1000

export const STALE = {
  config:    Infinity,  // priorities / categories / states — never changes at runtime
  setup:     Infinity,  // once completed, stays completed
  me:        10 * m,    // 10 min — own profile won't change mid-session
  users:      5 * m,   //  5 min — user list changes rarely
  dashboard:  1 * m,   //  1 min — aggregate stats, fine being slightly stale
  incidents: 30 * 1000, // 30 sec — list / detail, keep reasonably fresh
} as const
