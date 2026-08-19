export interface ProfileFormState {
  error: string | null;
  success: string | null;
  fieldErrors?: Record<string, string>;
}

export const EMPTY_PROFILE_FORM_STATE: ProfileFormState = { error: null, success: null };
