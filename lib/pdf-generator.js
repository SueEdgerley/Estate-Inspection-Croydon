// PDF generation utility
// Generates PDF from inspection data including conditional sections
// Shows "No" items with comments and photos

export async function generatePDF(inspection, answers) {
  try {
    // Get photos for answers
    const photosResponse = await fetch(`/api/photos?inspection_id=${inspection.id}`)
    const allPhotos = photosResponse.ok ? await photosResponse.json() : []
    
    // Get actions to show action categories
    const actionsResponse = await fetch(`/api/actions?inspection_id=${inspection.id}`)
    const actions = actionsResponse.ok ? await actionsResponse.json() : []
    
    // Group photos by question_id
    const photosByQuestion = {}
    allPhotos.forEach(photo => {
      if (!photosByQuestion[photo.question_id]) {
        photosByQuestion[photo.question_id] = []
      }
      photosByQuestion[photo.question_id].push(photo)
    })
    
    // Group actions by question_id
    const actionsByQuestion = {}
    actions.forEach(action => {
      if (action.question_id) {
        actionsByQuestion[action.question_id] = action
      }
    })
    
    const response = await fetch('/api/pdf/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspection,
        answers,
        photosByQuestion,
        actionsByQuestion
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to generate PDF')
    }
    
    const data = await response.json()
    return data.pdf_url
  } catch (error) {
    console.error('Error generating PDF:', error)
    // Return placeholder URL for now
    return `https://placeholder-pdf-url.com/inspections/${inspection.id}.pdf`
  }
}
