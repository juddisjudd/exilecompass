// ExileCompass account link state (Settings → Account). Wraps the Rust
// device-flow commands (account.rs): begin a link, poll until the user
// approves at exilecompass.com/device, then reflect the linked account and
// its PoE connection. The session token itself never reaches the frontend —
// it lives in the OS keychain on the Rust side.
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export interface AccountStatus {
  linked: boolean;
  name: string | null;
  poe_linked: boolean;
  poe_expired: boolean;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  expires_in: number | null;
  interval: number | null;
}

interface PollResult {
  status: 'linked' | 'pending' | 'slow_down' | 'denied' | 'expired';
  name: string | null;
}

type LinkPhase = 'idle' | 'waiting' | 'denied' | 'expired';

const state = $state({
  status: null as AccountStatus | null,
  loading: false,
  linkPhase: 'idle' as LinkPhase,
  userCode: '',
  verificationUrl: '',
  error: '',
});

// Bumped to cancel an in-flight poll loop (unlink or a fresh link attempt).
let pollGeneration = 0;

async function refresh(): Promise<void> {
  state.loading = true;
  try {
    state.status = await invoke<AccountStatus>('account_status');
    state.error = '';
  } catch (e) {
    state.error = String(e);
  } finally {
    state.loading = false;
  }
}

async function beginLink(): Promise<void> {
  state.error = '';
  state.linkPhase = 'idle';
  const generation = ++pollGeneration;
  try {
    const code = await invoke<DeviceCodeResponse>('account_begin_link');
    state.userCode = code.user_code;
    state.verificationUrl = code.verification_uri_complete ?? code.verification_uri;
    state.linkPhase = 'waiting';
    void openUrl(state.verificationUrl).catch(() => {});
    void poll(code.device_code, (code.interval ?? 5) * 1000, generation);
  } catch (e) {
    state.error = String(e);
  }
}

async function poll(deviceCode: string, intervalMs: number, generation: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  if (generation !== pollGeneration) return;
  try {
    const result = await invoke<PollResult>('account_poll_link', { deviceCode });
    if (generation !== pollGeneration) return;
    if (result.status === 'linked') {
      state.linkPhase = 'idle';
      state.userCode = '';
      await refresh();
      return;
    }
    if (result.status === 'denied' || result.status === 'expired') {
      state.linkPhase = result.status;
      state.userCode = '';
      return;
    }
    if (result.status === 'slow_down') intervalMs += 5000;
  } catch (e) {
    // Transient network failure — keep polling until the code expires.
    if (generation !== pollGeneration) return;
    state.error = String(e);
  }
  void poll(deviceCode, intervalMs, generation);
}

function cancelLink(): void {
  pollGeneration += 1;
  state.linkPhase = 'idle';
  state.userCode = '';
}

async function unlink(): Promise<void> {
  pollGeneration += 1;
  try {
    await invoke('account_unlink');
  } catch (e) {
    state.error = String(e);
  }
  state.linkPhase = 'idle';
  state.userCode = '';
  await refresh();
}

function openVerification(): void {
  if (state.verificationUrl) void openUrl(state.verificationUrl).catch(() => {});
}

export const account = {
  get status() {
    return state.status;
  },
  get loading() {
    return state.loading;
  },
  get linkPhase() {
    return state.linkPhase;
  },
  get userCode() {
    return state.userCode;
  },
  get error() {
    return state.error;
  },
  refresh,
  beginLink,
  cancelLink,
  unlink,
  openVerification,
};
