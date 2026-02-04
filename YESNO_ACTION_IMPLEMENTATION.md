# Yes/No Question Action Implementation - Complete ✅

## ✅ Implementation Complete

### Global Behavior for Yes/No Questions

When a Yes/No question is answered **"No"**:
- ✅ Automatically create/update Action record
- ✅ Action category from `question.action_category` (not hardcoded)
- ✅ Include section title + question text in action description
- ✅ Require comment (if `require_comment_on_no` is true)
- ✅ Require at least one photo (if `require_photo_on_no` is true)
- ✅ Show comment box immediately under question
- ✅ Show photo upload slot(s)
- ✅ Optionally show priority selector
- ✅ Silently create/update action behind the scenes

When answer changes **No → Yes**:
- ✅ Automatically close/remove action (mark as "resolved")
- ✅ Clear required status for photo/comment
- ✅ Clear comment and photos from UI

## Question Structure (from Airtable)

Each Yes/No question should have:
```javascript
{
  id: 'question_id',
  question_type: 'yesno',
  label: 'Question text',
  action_category: 'grounds' | 'cleaning' | 'repairs' | 'asb' | 'health_safety' | 'fire_safety' | 'other',
  action_priority: 'low' | 'medium' | 'high' | null,
  require_photo_on_no: true | false (default: true),
  require_comment_on_no: true | false (default: true),
  create_action_on_no: true | false (default: true),
  is_required: true | false,
  depends_on_question_id: 'other_question_id' | null,
  show_when_value: true | false | 'value' | null
}
```

## Database Schema

### inspection_answers
- `answer_boolean` - Stores Yes/No value
- `notes` - Stores comment text for "No" answers

### inspection_photos
- `inspection_id` - Links to inspection
- `question_id` - Links to specific question
- `blob_url` - Vercel Blob Storage URL
- `blob_key` - Blob storage key

### actions
- `category` - From question.action_category (not hardcoded!)
- `priority` - From question.action_priority or user selection
- `description` - "Section: {section_title} – {question_text}"
- `comment` - Comment text from user
- `recipient_person_id` - For ASB/H&S/Fire routing
- `status` - 'open' until resolved

### action_photos
- Links photos to actions (many-to-many)

## Component Flow

### YesNoQuestion Component
1. **User clicks "No"**
   - Shows comment box (required)
   - Shows photo upload (required, at least one)
   - Shows priority selector (optional)
   - Shows action category info

2. **User fills comment and uploads photo(s)**
   - Comment stored in `answers[questionId + '_comment']`
   - Photos uploaded to Vercel Blob
   - Photo records saved to `inspection_photos`

3. **On "Save Draft" or "Next Section"**
   - Validates comment and photos are provided
   - Creates/updates action automatically
   - Action category from `question.action_category`
   - Action description = "Section: {sectionName} – {questionText}"

4. **User changes to "Yes"**
   - Closes existing action (marks as resolved)
   - Clears comment and photos from UI
   - Removes required validation

## Action Creation Logic

```javascript
// In processNoAnswers()
const action = await handleNoAnswer({
  inspectionId,
  sectionId,
  sectionName,
  questionId,
  questionText: question.label,
  question, // Full question object with action_category
  comment,
  photos: photoIds,
  priority,
  recipientPersonId
})
```

Action is created with:
- `category`: `question.action_category` (grounds/cleaning/repairs/etc.)
- `description`: `"Section: ${sectionName} – ${questionText}"`
- `comment`: User's comment text
- `priority`: From question or user selection
- `status`: 'open'

## PDF Generation

PDF shows for each "No" item:
- ✅ "No" clearly displayed
- ✅ Comment text included
- ✅ Photo(s) embedded under the question
- ✅ "Action raised: {category}" label

## Email Sending

### Category Emails
Actions grouped by category:
- `repairs` → REPAIRS_EMAIL
- `grounds` → GROUNDS_EMAIL
- `cleaning` → CLEANING_EMAIL
- `asb` → ASB_EMAIL
- `health_safety` → HEALTH_SAFETY_EMAIL
- `fire_safety` → FIRE_SAFETY_EMAIL
- `other` → OTHER_EMAIL

Each category email includes:
- PDF attached/linked
- Bullet list of actions (section + item + comment)

### Targeted Emails
For ASB/Health&Safety/Fire categories:
- Also send to selected recipients from "Who to send to?" question
- Email includes PDF + only relevant issues for that person

## Files Created/Updated

### New Files
- `lib/yesno-action-handler.js` - Action creation/update logic
- `app/components/questions/YesNoQuestion.jsx` - Yes/No question with comment/photo
- `lib/blob-storage.js` - Photo upload utilities
- `app/api/photos/upload/route.js` - Photo upload endpoint
- `app/api/photos/route.js` - Photo management API
- `app/api/actions/[id]/route.js` - Action update endpoint
- `app/api/actions/[id]/photos/route.js` - Link photos to actions

### Updated Files
- `lib/db.js` - Added inspection_photos, action_photos tables, updated actions table
- `app/api/actions/route.js` - Updated to use category instead of type
- `app/api/inspections/[id]/answers/route.js` - Handle comments in notes field
- `app/(app)/inspections/[id]/section/[sectionId]/page.jsx` - Process No answers
- `lib/email-sender.js` - Group by category, send targeted emails
- `lib/pdf-generator.js` - Include photos and action categories

## Environment Variables

```env
# Category Email Addresses
REPAIRS_EMAIL=repairs@example.com
GROUNDS_EMAIL=grounds@example.com
CLEANING_EMAIL=cleaning@example.com
ASB_EMAIL=asb@example.com
HEALTH_SAFETY_EMAIL=healthsafety@example.com
FIRE_SAFETY_EMAIL=firesafety@example.com
OTHER_EMAIL=actions@example.com

# Vercel Blob Storage (for photos)
BLOB_READ_WRITE_TOKEN=your_blob_token
```

## Testing Checklist

1. ✅ Answer Yes/No question as "No"
   - Comment box appears (required)
   - Photo upload appears (required)
   - Priority selector appears (if configured)

2. ✅ Fill comment and upload photo
   - Validation requires both
   - Photos upload to Vercel Blob
   - Photos linked to inspection + question

3. ✅ Save section
   - Action created automatically
   - Action category from question.action_category
   - Action description includes section + question text

4. ✅ Change answer to "Yes"
   - Action marked as resolved
   - Comment/photos cleared
   - Required validation removed

5. ✅ Submit inspection
   - PDF generated with No items, comments, photos
   - Category emails sent (grouped by category)
   - Targeted emails sent for ASB/H&S/Fire

## Template Configuration

In Airtable Template Questions table, configure:
- **GM template questions** → `action_category = 'grounds'`
- **Cleaning template questions** → `action_category = 'cleaning'`
- **Repairs template questions** → `action_category = 'repairs'`
- **ASB/H&S/Fire trigger questions** → Set to their respective categories

All core functionality is implemented! Ready for Airtable integration. 🚀
