// Email sending utility
// Sends targeted emails to recipients and category emails for actions

export async function sendEmails({ inspection, recipients, actionCategories, allActions, pdfUrl }) {
  try {
    const sent = []
    const failed = []

    // Send targeted emails to selected recipients
    for (const recipientId of recipients) {
      try {
        // Get person details
        const personResponse = await fetch(`/api/people/${recipientId}`)
        if (!personResponse.ok) continue
        
        const person = await personResponse.json()
        
        // Send email
        const emailResponse = await fetch('/api/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: person.email,
            subject: `Inspection Report: ${inspection.location_label || inspection.title}`,
            template: 'inspection_report',
            data: {
              inspection,
              person,
              pdfUrl
            }
          })
        })
        
        if (emailResponse.ok) {
          sent.push({
            email: person.email,
            person_id: person.id,
            type: 'targeted'
          })
        } else {
          failed.push({ email: person.email, error: 'Failed to send' })
        }
      } catch (error) {
        console.error(`Error sending email to ${recipientId}:`, error)
        failed.push({ recipient_id: recipientId, error: error.message })
      }
    }

    // Send category emails for actions (grouped by category)
    const categoryEmails = {
      repairs: process.env.REPAIRS_EMAIL || 'repairs@example.com',
      grounds: process.env.GROUNDS_EMAIL || 'grounds@example.com',
      cleaning: process.env.CLEANING_EMAIL || 'cleaning@example.com',
      asb: process.env.ASB_EMAIL || 'asb@example.com',
      health_safety: process.env.HEALTH_SAFETY_EMAIL || 'healthsafety@example.com',
      fire_safety: process.env.FIRE_SAFETY_EMAIL || 'firesafety@example.com',
      other: process.env.OTHER_EMAIL || 'actions@example.com'
    }

    // Group actions by category
    for (const categoryGroup of actionCategories) {
      const category = categoryGroup.category
      const categoryEmail = categoryEmails[category]
      if (!categoryEmail) continue

      // Get actions for this category
      const categoryActions = allActions.filter(a => a.category === category)
      
      // Build action list
      const actionList = categoryActions.map(action => 
        `• ${action.section_name || 'Section'} – ${action.title}${action.comment ? ` (${action.comment})` : ''}`
      ).join('\n')

      try {
        const emailResponse = await fetch('/api/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: categoryEmail,
            subject: `New ${category} Actions: ${inspection.location_label || inspection.title}`,
            template: 'action_notification',
            data: {
              inspection,
              category,
              actionCount: categoryGroup.count,
              actionList,
              pdfUrl
            }
          })
        })

        if (emailResponse.ok) {
          sent.push({
            email: categoryEmail,
            type: 'category',
            category,
            count: categoryGroup.count
          })
        }
      } catch (error) {
        console.error(`Error sending category email for ${category}:`, error)
        failed.push({ category, error: error.message })
      }
    }
    
    // Targeted emails: any open action with a resolved recipient (e.g. NV routing → people)
    const directedActions = allActions.filter(
      (a) => a.recipient_person_id && a.recipient_email
    )

    const recipientMap = new Map()
    for (const action of directedActions) {
      if (!action.recipient_person_id) continue
      
      if (!recipientMap.has(action.recipient_person_id)) {
        recipientMap.set(action.recipient_person_id, {
          person_id: action.recipient_person_id,
          email: action.recipient_email,
          name: action.recipient_name,
          actions: []
        })
      }
      recipientMap.get(action.recipient_person_id).actions.push(action)
    }
    
    // Send to each recipient
    for (const recipient of recipientMap.values()) {
      try {
        const actionList = recipient.actions.map(action => 
          `• ${action.section_name || 'Section'} – ${action.title}${action.comment ? ` (${action.comment})` : ''}`
        ).join('\n')
        
        const emailResponse = await fetch('/api/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: recipient.email,
            subject: `Action Required: ${inspection.location_label || inspection.title}`,
            template: 'targeted_action',
            data: {
              inspection,
              recipient: recipient.name,
              actionList,
              pdfUrl
            }
          })
        })

        if (emailResponse.ok) {
          sent.push({
            email: recipient.email,
            person_id: recipient.person_id,
            type: 'targeted',
            count: recipient.actions.length
          })
        }
      } catch (error) {
        console.error(`Error sending targeted email to ${recipient.email}:`, error)
        failed.push({ recipient: recipient.email, error: error.message })
      }
    }

    return { sent, failed }
  } catch (error) {
    console.error('Error sending emails:', error)
    return { sent: [], failed: [{ error: error.message }] }
  }
}
