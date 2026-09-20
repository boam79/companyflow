import { isGuestCompanyId } from '../guest/ids'

export const MEMORY_VFS = 'memory'

export function sqliteOpenMode(input: { companyId: string; memory?: boolean }) {
  if (input.memory || isGuestCompanyId(input.companyId)) {
    return { memory: true as const, vfsName: MEMORY_VFS, installSah: false }
  }
  return { memory: false as const, vfsName: 'opfs-sahpool' as const, installSah: true }
}
