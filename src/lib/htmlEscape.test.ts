import { describe, expect, it } from 'vitest'
import { escapeHtml } from './htmlEscape'

describe('HTML 이스케이프', () => {
  it('인쇄 창에 넣을 글자의 태그를 막는다', () => {
    expect(escapeHtml(`<img src="x" onerror="alert(1)">`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;',
    )
    expect(escapeHtml(`a&b`)).toBe('a&amp;b')
  })
})
