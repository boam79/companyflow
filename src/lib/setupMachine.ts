export type SetupPhase =
  | 'admin_pending'
  | 'pc_init_pending'
  | 'ready'
  | 'failed'

export type SetupEvent =
  | { type: 'admin_linked' }
  | { type: 'pc_claimed' }
  | { type: 'persist_ok' }
  | { type: 'fail'; reason: string }
  | { type: 'retry' }

export type SetupState = {
  phase: SetupPhase
  reason: string | null
  persistOk: boolean
  deviceClaimed: boolean
}

export function initialSetupState(): SetupState {
  return {
    phase: 'admin_pending',
    reason: null,
    persistOk: false,
    deviceClaimed: false,
  }
}

export function reduceSetup(state: SetupState, event: SetupEvent): SetupState {
  if (event.type === 'retry') {
    if (state.phase !== 'failed') return state
    if (!state.deviceClaimed) {
      return { ...state, phase: 'pc_init_pending', reason: null }
    }
    return { ...state, phase: 'pc_init_pending', reason: null }
  }

  if (event.type === 'fail') {
    return { ...state, phase: 'failed', reason: event.reason }
  }

  switch (state.phase) {
    case 'admin_pending':
      if (event.type === 'admin_linked') {
        return { ...state, phase: 'pc_init_pending', reason: null }
      }
      return state
    case 'pc_init_pending':
      if (event.type === 'pc_claimed') {
        return { ...state, deviceClaimed: true }
      }
      if (event.type === 'persist_ok' && state.deviceClaimed) {
        return {
          ...state,
          persistOk: true,
          phase: 'ready',
          reason: null,
        }
      }
      return state
    case 'ready':
      return state
    case 'failed':
      return state
    default:
      return state
  }
}

export function canMarkUsable(state: SetupState): boolean {
  return state.phase === 'ready' && state.persistOk && state.deviceClaimed
}

export function setupLabel(phase: SetupPhase): string {
  if (phase === 'admin_pending') return '관리자 연결 대기'
  if (phase === 'pc_init_pending') return 'PC 초기화 대기'
  if (phase === 'ready') return '사용 가능'
  return '실패'
}
