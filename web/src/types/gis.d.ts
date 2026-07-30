/**
 * The sliver of Google Identity Services the sign-in screen uses, typed by hand
 * so the app doesn't take a dependency for four function signatures.
 * Reference: https://developers.google.com/identity/gsi/web/reference/js-reference
 */
interface GisCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GisIdConfiguration {
  client_id: string;
  callback: (response: GisCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GisButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

interface GisIdApi {
  initialize(config: GisIdConfiguration): void;
  renderButton(parent: HTMLElement, config: GisButtonConfiguration): void;
  prompt(): void;
  disableAutoSelect(): void;
}

interface Window {
  google?: {
    accounts: {
      id: GisIdApi;
    };
  };
}
