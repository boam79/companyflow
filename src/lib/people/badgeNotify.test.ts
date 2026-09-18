import { describe, expect, it } from 'vitest'
import {
  assertAdminEmail,
  assertSlackWebhook,
  badgeNotifyMessage,
  mailtoHref,
  slackFormBody,
} from './badgeNotify'

describe('명찰 보내기', () => {
  it('입사 명찰 문구를 만든다', () => {
    expect(badgeNotifyMessage({ name: '김 술 기', title: '주임', department: '디자인팀' })).toContain('김 술 기')
    expect(badgeNotifyMessage({ name: '김 술 기', title: '주임', department: '디자인팀' })).toContain('주임')
  })

  it('관리자 메일과 슬랙 웹훅만 받는다', () => {
    expect(assertAdminEmail('ops@company.example')).toBe('ops@company.example')
    expect(() => assertAdminEmail('ops')).toThrow(/이메일/)
    expect(assertSlackWebhook('https://hooks.slack.com/services/T/B/XXX')).toContain('hooks.slack.com')
    expect(() => assertSlackWebhook('https://example.com/hook')).toThrow(/슬랙/)
  })

  it('mailto와 슬랙 payload를 만든다', () => {
    expect(mailtoHref('ops@company.example', '명찰', '본문')).toContain('mailto:ops@company.example')
    expect(slackFormBody('명찰 초안')).toContain('payload=')
  })
})
