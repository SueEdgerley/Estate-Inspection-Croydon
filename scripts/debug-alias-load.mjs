import { fileURLToPath } from 'node:url'
console.log('start')
const module = await import('@/lib/pdf/buildInspectionReportPdf.js')
console.log('loaded', typeof module.buildInspectionReportPdf)
console.log('path', fileURLToPath(import.meta.url))
