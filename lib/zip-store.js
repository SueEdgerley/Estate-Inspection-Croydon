/**
 * Minimal ZIP writer (DEFLATE when smaller, otherwise store).
 * Uses Node zlib only — no extra package.
 */

import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let c = i
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c >>> 0
}

export function crc32(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return { time: 0, date: 0 }
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date: dosDate }
}

/**
 * @param {{ name: string, bytes: Uint8Array|Buffer }[]} files
 * @returns {Buffer}
 */
export function buildZipArchive(files, now = new Date()) {
  const encoder = new TextEncoder()
  const parts = []
  const centrals = []
  let offset = 0
  const { time, date } = dosDateTime(now)
  const list = Array.isArray(files) ? files : []

  for (const file of list) {
    const nameBytes = Buffer.from(encoder.encode(String(file.name || 'file').replace(/\\/g, '/')))
    const data = Buffer.from(file.bytes || [])
    const compressed = deflateRawSync(data)
    const useStore = compressed.length >= data.length
    const payload = useStore ? data : compressed
    const method = useStore ? 0 : 8
    const crc = crc32(data)

    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    nameBytes.copy(local, 30)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBytes.copy(central, 46)

    parts.push(local, payload)
    centrals.push(central)
    offset += local.length + payload.length
  }

  const centralDir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(list.length, 8)
  eocd.writeUInt16LE(list.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, centralDir, eocd])
}

export function countZipEntries(buffer) {
  const b = Buffer.from(buffer || [])
  for (let i = b.length - 22; i >= 0; i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) return b.readUInt16LE(i + 10)
  }
  return 0
}

export function listZipEntryNames(buffer) {
  const b = Buffer.from(buffer || [])
  let eocd = -1
  for (let i = b.length - 22; i >= 0; i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = b.readUInt16LE(eocd + 10)
  let offset = b.readUInt32LE(eocd + 16)
  const names = []
  for (let n = 0; n < count; n += 1) {
    if (b.readUInt32LE(offset) !== 0x02014b50) break
    const nameLen = b.readUInt16LE(offset + 28)
    const extraLen = b.readUInt16LE(offset + 30)
    const commentLen = b.readUInt16LE(offset + 32)
    names.push(b.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'))
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}
