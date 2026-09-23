import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { parseContractText } from './parseFields'
import {
  SAMPLE_CONTRACT_DOCS,
  buildSampleContractPdf,
  sampleContractFileName,
  sampleContractPlainText,
} from './sampleDocs'

function fieldsOf(text: string) {
  return Object.fromEntries(parseContractText(text).map((row) => [row.field, row.value]))
}

describe('샘플 계약서', () => {
  it('임대·복합기·회선·보험 4건이고 받는 이름이 확장자와 맞다', () => {
    expect(SAMPLE_CONTRACT_DOCS.map((row) => row.title)).toEqual([
      '사무실 임대',
      '복합기 유지보수',
      '인터넷 전용회선',
      '영업배상 책임보험',
    ])
    expect(sampleContractFileName(SAMPLE_CONTRACT_DOCS[0])).toBe('샘플-사무실임대.pdf')
    expect(sampleContractFileName(SAMPLE_CONTRACT_DOCS[1])).toBe('샘플-복합기유지보수.png')
    expect(sampleContractFileName(SAMPLE_CONTRACT_DOCS[2])).toBe('샘플-인터넷전용회선.jpg')
    expect(sampleContractFileName(SAMPLE_CONTRACT_DOCS[3])).toBe('샘플-영업배상책임보험.pdf')
  })

  it('한글 샘플 문구에서 번호·상대방·금액·기간을 뽑는다', () => {
    for (const doc of SAMPLE_CONTRACT_DOCS) {
      expect(fieldsOf(sampleContractPlainText(doc))).toMatchObject({
        title: doc.title,
        contractNo: doc.contractNo,
        counterparty: doc.counterparty,
        ownerName: doc.ownerName,
        signedAt: doc.signedAt,
        startAt: doc.startAt,
        endAt: doc.endAt,
        amount: String(doc.amount),
      })
    }
  })

  it('글자 PDF는 이 PC에서 연 뒤 같은 칸 값을 넣는다', async () => {
    const lease = SAMPLE_CONTRACT_DOCS[0]
    const fontBytes = new Uint8Array(await readFile('public/fonts/NanumGothic-contract.ttf'))
    const bytes = await buildSampleContractPdf(lease, fontBytes)
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(fieldsOf(sampleContractPlainText(lease))).toMatchObject({
      title: lease.title,
      contractNo: 'CON-SAMPLE-01',
      counterparty: lease.counterparty,
      amount: String(lease.amount),
    })
  })
})
