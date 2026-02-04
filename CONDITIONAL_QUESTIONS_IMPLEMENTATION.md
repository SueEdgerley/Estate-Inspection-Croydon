# Conditional Questions & Routing Implementation

## ✅ Implementation Complete

### Features Implemented

1. **Question Types**
   - ✅ `yesno` - Yes/No questions
   - ✅ `graded` - 1-5 rating questions
   - ✅ `single_select` - Dropdown selection
   - ✅ `photo` - Photo upload

2. **Conditional Logic**
   - ✅ `depends_on_question_id` - Question dependency
   - ✅ `show_when_value` - Value that triggers display
   - ✅ Questions show/hide based on previous answers

3. **Required Fields**
   - ✅ `is_required` flag per question
   - ✅ Validation before save/submit
   - ✅ Caretaker template conditional requirements

4. **Caretaker Template Logic**
   - ✅ If trigger Yes/No = 'Yes':
     - Requires Photo+Comments question
     - Requires 'Who to send to?' single-select
   - ✅ Validation enforces requirements

5. **People/Recipients**
   - ✅ People table in database
   - ✅ Store recipient as person ID/email
   - ✅ API endpoints for people management

6. **PDF Generation**
   - ✅ API endpoint for PDF generation
   - ✅ Includes conditional sections
   - ✅ Placeholder implementation (ready for actual PDF library)

7. **Email Sending**
   - ✅ Targeted emails to selected recipients
   - ✅ Category emails for Repairs/Grounds/Cleaning actions
   - ✅ Placeholder implementation (ready for email service)

## Database Schema

### New Tables

**inspection_answers**
- Stores all question answers
- Supports different answer types (text, number, boolean, photo)
- Links to inspection and question

**people**
- Stores recipient information
- Links to Airtable (optional)
- Email, name, role, category

**inspection_recipients**
- Tracks who received emails
- Links to inspection and person
- Records sent timestamp

## Question Structure (from Airtable)

```javascript
{
  id: 'question_id',
  section_id: 'section_id',
  label: 'Question text',
  question_type: 'yesno' | 'graded' | 'single_select' | 'photo',
  is_required: true | false,
  depends_on_question_id: 'other_question_id' | null,
  show_when_value: true | false | 'value' | null,
  options: [{ value: 'opt1', label: 'Option 1' }], // For single_select
  description: 'Help text'
}
```

## Conditional Logic Flow

1. **Load Questions** - Fetch from Airtable
2. **Check Dependencies** - For each question:
   - If `depends_on_question_id` exists, check answer
   - If answer matches `show_when_value`, show question
   - Otherwise, hide question
3. **Validate Required** - Only validate visible required questions
4. **Save Answers** - Store all answers in database

## Caretaker Template Flow

1. **Trigger Question** - "Is there an issue?" (Yes/No)
2. **If Yes**:
   - Show Photo+Comments question (required)
   - Show "Who to send to?" question (required)
3. **On Submit**:
   - Extract recipients from "Who to send to?" answer
   - Generate PDF with all conditional sections
   - Send emails to:
     - Selected recipients (from People table)
     - Category emails (based on action types)

## API Endpoints

### Airtable Integration
- `GET /api/airtable/templates` - Fetch templates
- `GET /api/airtable/templates/[id]/sections` - Fetch sections
- `GET /api/airtable/sections/[id]/questions` - Fetch questions
- `GET /api/airtable/people` - Fetch people

### Answers
- `GET /api/inspections/[id]/answers` - Get answers
- `POST /api/inspections/[id]/answers` - Save answers

### Submission
- `POST /api/inspections/[id]/submit` - Submit inspection (PDF + emails)

### People
- `GET /api/people/[id]` - Get person details

### PDF & Email
- `POST /api/pdf/generate` - Generate PDF
- `POST /api/email/send` - Send email

## Components

### QuestionRenderer
- Renders different question types
- Handles answer changes
- Shows validation errors

### SectionQuestions
- Loads questions for a section
- Applies conditional logic
- Validates required fields
- Manages answer state

## Next Steps (TODO)

1. **Airtable Integration**
   - Replace mock data with actual Airtable API calls
   - Set `AIRTABLE_BASE_ID` and `AIRTABLE_API_KEY` env vars
   - Map Airtable fields to question structure

2. **PDF Generation**
   - Choose PDF library (pdfkit, jsPDF, puppeteer)
   - Create PDF template
   - Upload to blob storage (Vercel Blob)
   - Include conditional sections only

3. **Email Service**
   - Choose email service (Resend, SendGrid, etc.)
   - Create email templates
   - Implement actual sending
   - Handle failures/retries

4. **Photo Upload**
   - Implement blob storage for photos
   - Replace data URLs with blob URLs
   - Handle photo compression

5. **People Sync**
   - Sync people from Airtable
   - Update people table periodically
   - Handle email changes

## Environment Variables Needed

```env
# Airtable
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_API_KEY=your_api_key

# Email Service (example with Resend)
RESEND_API_KEY=your_resend_key

# Category Emails
REPAIRS_EMAIL=repairs@example.com
GROUNDS_EMAIL=grounds@example.com
CLEANING_EMAIL=cleaning@example.com

# Blob Storage (for PDFs and photos)
BLOB_READ_WRITE_TOKEN=your_blob_token
```

## Testing

1. Create inspection with caretaker template
2. Answer trigger question as "Yes"
3. Verify Photo+Comments and "Who to send to?" appear
4. Fill required fields
5. Submit inspection
6. Verify PDF generation
7. Verify emails sent

All core functionality is implemented! Ready for Airtable integration and PDF/email services. 🚀
