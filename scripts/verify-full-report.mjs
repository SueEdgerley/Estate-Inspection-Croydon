import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from '@vercel/postgres'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

const envPath = path.join(rootDir, '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    const value = rest.join('=').replace(/^['"]|['"]$/g, '')
    if (key && value && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error('Usage: node scripts/verify-full-report.mjs <inspectionId>')
  process.exit(1)
}
const inspectionId = args[0]

async function main() {
  const inspectionRows = await sql`SELECT * FROM inspections WHERE id = ${inspectionId} LIMIT 1`
  if (!inspectionRows.rows.length) {
    throw new Error(`Inspection not found: ${inspectionId}`)
  }
  const inspectionRow = inspectionRows.rows[0]

  const { buildFullInspectionReportPdfPayload } = await import('../lib/full-inspection-report-pdf.js')
  const { buildInspectionReportPdf } = await import('../lib/pdf/buildInspectionReportPdf.js')

  const { pdfData } = await buildFullInspectionReportPdfPayload(sql, inspectionId, inspectionRow)

  const totalAnswers = pdfData.sections.reduce((sum, section) => sum + (section.questions?.length || 0), 0)
  const answersWithComments = pdfData.sections.reduce(
    (sum, section) => sum + (section.questions?.filter((q) => q.comment && String(q.comment).trim()).length || 0),
    0
  )
  const answersWithPhotos = pdfData.sections.reduce(
    (sum, section) =>
      sum + (section.questions?.filter((q) => (q.id && pdfData.photos.some((photo) => photo.linkedQuestionId === q.id))).length || 0),
    0
  )
  const totalPdfPhotos = pdfData.photos.length

  console.log('PDF payload counts:')
  console.log('  sections=%d', pdfData.sections.length)
  console.log('  totalQuestions=%d', totalAnswers)
  console.log('  answersWithComments=%d', answersWithComments)
  console.log('  answersWithPhotos=%d', answersWithPhotos)
  console.log('  total pdfPhotos=%d', totalPdfPhotos)

  const commentSamples = []
  for (const section of pdfData.sections) {
    for (const question of section.questions || []) {
      if (question.comment && String(question.comment).trim()) {
        commentSamples.push({ id: question.id, text: question.text, comment: question.comment })
      }
    }
  }
  console.log('Comment sample count:', commentSamples.length)
  console.log(commentSamples.slice(0, 5).map((c) => ({ id: c.id, comment: c.comment })).join('\n'))

  const photoSamples = []
  for (const photo of pdfData.photos.slice(0, 20)) {
    photoSamples.push({ linkedQuestionId: photo.linkedQuestionId, url: photo.url, caption: photo.caption })
  }
  console.log('Photo sample count:', photoSamples.length)
  console.log(photoSamples.map((p) => `${p.linkedQuestionId} -> ${p.url}`).join('\n'))

  const pdfBytes = await buildInspectionReportPdf(pdfData)
  const outPath = path.join(rootDir, `verify-report-${inspectionId.slice(0, 8)}.pdf`)
  fs.writeFileSync(outPath, Buffer.from(pdfBytes))
  console.log('Saved regenerated PDF to', outPath)

  const pdfContent = fs.readFileSync(outPath)
  const pdfText = pdfContent.toString('latin1')
  const foundComment = commentSamples.length > 0 && commentSamples.some((c) => pdfText.includes(c.comment))
  const foundPhotoRef = photoSamples.length > 0 && photoSamples.some((p) => pdfText.includes(p.url) || pdfText.includes(path.basename(p.url)))
  const embeddedImages = /\/Subtype\s*\/Image|DCTDecode|JFIF/.test(pdfText)

  console.log('Verification:')
  console.log('  comment text present in PDF bytes:', foundComment)
  console.log('  photo reference text present in PDF bytes:', foundPhotoRef)
  console.log('  embedded image markers found:', embeddedImages)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
