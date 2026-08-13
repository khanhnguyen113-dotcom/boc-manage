export interface UserFormState {
  error: string | null;
  success: string | null;
  fieldErrors?: Record<string, string>;
}

export const EMPTY_USER_FORM_STATE: UserFormState = { error: null, success: null };
