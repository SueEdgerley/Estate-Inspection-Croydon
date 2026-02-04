// Vercel Blob Storage utilities for photo uploads

export async function uploadPhoto(file, inspectionId, questionId) {
  try {
    // Upload to Vercel Blob Storage
    const formData = new FormData()
    formData.append('file', file)
    formData.append('inspection_id', inspectionId)
    formData.append('question_id', questionId)
    
    const response = await fetch('/api/photos/upload', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error('Failed to upload photo')
    }
    
    const data = await response.json()
    
    // Save photo record to database
    await fetch('/api/photos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspection_id: inspectionId,
        question_id: questionId,
        blob_url: data.url,
        blob_key: data.key,
        filename: file.name
      })
    })
    
    return data.url
  } catch (error) {
    console.error('Error uploading photo:', error)
    throw error
  }
}
