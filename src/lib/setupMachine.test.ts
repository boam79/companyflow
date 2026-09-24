import { describe, expect, it } from 'vitest'
import {
  canMarkUsable,
  initialSetupState,
  reduceSetup,
  setupFromStoredPhase,
  setupLabel,
  setupNeedsSqliteOpen,
  setupPageLead,
  setupReadyLead,
  setupRunButtonVisible,
  setupCardLead,
  setupShowsStepLog,
} from './setupMachine'

describe('지정 PC 초기화 상태', () => {
  it('관리자 연결 전에는 사용 가능으로 표시하지 않는다', () => {
    const start = initialSetupState()
    expect(canMarkUsable(start)).toBe(false)
    expect(setupLabel(start.phase)).toBe('관리자 연결 대기')
  })

  it('영속 저장 확인 전에 사용 가능으로 올리지 않는다', () => {
    let state = initialSetupState()
    state = reduceSetup(state, { type: 'admin_linked' })
    state = reduceSetup(state, { type: 'pc_claimed' })
    expect(state.phase).toBe('pc_init_pending')
    expect(canMarkUsable(state)).toBe(false)
  })

  it('성공하면 사용 가능만 알리고 단계 로그는 두지 않는다', () => {
    expect(setupShowsStepLog()).toBe(false)
    expect(setupPageLead()).toContain('다른 CompanyFlow 창은 닫고')
    expect(setupReadyLead()).toContain('업무 원본')
    expect(setupReadyLead()).toContain('업무 시작')
    expect(setupLabel('ready')).toBe('사용 가능')
  })

  it('사용 가능이면 다시 설정 버튼을 두지 않는다', () => {
    expect(setupRunButtonVisible(true)).toBe(false)
    expect(setupRunButtonVisible(false)).toBe(true)
    expect(setupCardLead(true)).toBe(setupReadyLead())
    expect(setupCardLead(false)).toBe(setupPageLead())
  })

  it('이미 열린 원본은 다시 열지 않고, 저장된 사용 가능을 복원한다', () => {
    expect(setupNeedsSqliteOpen(true)).toBe(false)
    expect(setupNeedsSqliteOpen(false)).toBe(true)
    expect(canMarkUsable(setupFromStoredPhase('ready'))).toBe(true)
    expect(setupFromStoredPhase('pc_init_pending').phase).toBe('admin_pending')
  })

  it('장치 예약과 영속 저장이 끝난 뒤에만 사용 가능하다', () => {
    let state = initialSetupState()
    state = reduceSetup(state, { type: 'admin_linked' })
    state = reduceSetup(state, { type: 'pc_claimed' })
    state = reduceSetup(state, { type: 'persist_ok' })
    expect(state.phase).toBe('ready')
    expect(canMarkUsable(state)).toBe(true)
  })

  it('실패 후 재시도는 같은 단계로 재개한다', () => {
    let state = initialSetupState()
    state = reduceSetup(state, { type: 'admin_linked' })
    state = reduceSetup(state, { type: 'pc_claimed' })
    state = reduceSetup(state, { type: 'fail', reason: 'OPFS 거부' })
    expect(state.phase).toBe('failed')
    state = reduceSetup(state, { type: 'retry' })
    expect(state.phase).toBe('pc_init_pending')
    expect(state.deviceClaimed).toBe(true)
  })
})
