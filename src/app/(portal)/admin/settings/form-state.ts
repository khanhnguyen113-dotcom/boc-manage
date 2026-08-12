/** Tách khỏi `actions.ts` vì file `'use server'` chỉ được export hàm async. */

export interface SettingsState {
  error: string | null;
  success: string | null;
}

export const EMPTY_SETTINGS_STATE: SettingsState = { error: null, success: null };
