# Airtable Template Implementation - Complete ✅

## ✅ Implementation Complete

### Airtable as Read-Only Config

All templates, sections, questions, and people are now read from Airtable:
- ✅ Templates table
- ✅ Sections table  
- ✅ Template Questions table
- ✅ People table

### Template, Section, Question Models

**Template Model:**
- `id` - Record ID from Airtable
- `name` - Template name
- `description` - Template description
- `template_type` - Type (caretaker, standard, etc.)

**Section Model:**
- `id` - Record ID from Airtable
- `template_id` - Links to template
- `name` - Section name
- `order` - Display order
- `section_type` - Type (standard, asb, health_safety, fire_safety)

**Question Model:**
- `id` - Record ID from Airtable
- `section_id` - Links to section
- `label` - Question text
- `question_type` - yesno, graded, single_select, photo
- `is_required` - Required flag
- `depends_on_question_id` - Conditional display
- `show_when_value` - Value that triggers display
- `action_category` - Category for auto-created actions
- `action_priority` - Default priority
- `require_photo_on_no` - Require photo when "No"
- `require_comment_on_no` - Require comment when "No"
- `create_action_on_no` - Create action when "No"

### Caretaker Template Support

#### 1. Yes/No Cleaning Questions
- ✅ Many Yes/No questions that create actions when answered "No"
- ✅ Require comment + photo when "No"
- ✅ Action category from `question.action_category` (typically "cleaning")
- ✅ Validation enforces comment and photo requirements

#### 2. ASB/H&S/Fire Sections
- ✅ Sections with `section_type` = asb/health_safety/fire_safety
- ✅ Yes/No trigger question that when "Yes":
  - Reveals photo+comment input
  - Reveals recipient selector (from People table)
  - Creates action in category (asb/health_safety/fire_safety)
- ✅ Validation enforces photo+comment and recipient when trigger = "Yes"

### Rules Drive Everything

#### Validation
- ✅ Uses template rules to validate:
  - Caretaker cleaning questions: comment + photo required on "No"
  - ASB/H&S/Fire triggers: photo+comment + recipient required on "Yes"
  - Conditional questions: only validate visible questions

#### PDF Output
- ✅ Shows all questions from template structure
- ✅ Includes conditional sections based on answers
- ✅ Shows "No" items with comments and photos
- ✅ Shows action categories from template rules

#### Email Routing
- ✅ Groups actions by category from template:
  - `grounds` → GROUNDS_EMAIL
  - `cleaning` → CLEANING_EMAIL
  - `repairs` → REPAIRS_EMAIL
  - `asb` → ASB_EMAIL
  - `health_safety` → HEALTH_SAFETY_EMAIL
  - `fire_safety` → FIRE_SAFETY_EMAIL
- ✅ Sends targeted emails to selected recipients for ASB/H&S/Fire

## Airtable Table Structure

### Templates Table
| Field | Type | Description |
|-------|------|-------------|
| Record ID | Single line text | Unique ID |
| Name | Single line text | Template name |
| Description | Long text | Template description |
| Template Type | Single select | caretaker, standard, etc. |
| Active | Checkbox | Is template active |

### Sections Table
| Field | Type | Description |
|-------|------|-------------|
| Record ID | Single line text | Unique ID |
| Template ID | Link to Templates | Parent template |
| Name | Single line text | Section name |
| Order | Number | Display order |
| Section Type | Single select | standard, asb, health_safety, fire_safety |
| Active | Checkbox | Is section active |

### Template Questions Table
| Field | Type | Description |
|-------|------|-------------|
| Record ID | Single line text | Unique ID |
| Section ID | Link to Sections | Parent section |
| Question Text | Single line text | Question label |
| Question Type | Single select | yesno, graded, single_select, photo |
| Required | Checkbox | Is question required |
| Depends On Question ID | Link to Questions | Conditional display |
| Show When Value | Formula/Text | Value that triggers display |
| Description | Long text | Help text |
| Options | Multiple select | Options for single_select |
| Action Category | Single select | grounds, cleaning, repairs, asb, health_safety, fire_safety, other |
| Action Priority | Single select | low, medium, high |
| Require Photo on No | Checkbox | Default: true |
| Require Comment on No | Checkbox | Default: true |
| Create Action on No | Checkbox | Default: true |
| Order | Number | Display order |
| Active | Checkbox | Is question active |
| **Triggers Task** | Checkbox | When issue (N or raiseIssue): create task/action row |
| **Triggers Email** | Checkbox | When issue: create outbound_emails row (grouped by team) |
| **Email Route Team Id** | Single line text | Team identifier for grouping outbound emails |
| **Issue Type** | Single line text | Stored on answer/task for reporting |
| **Programme Tag** | Single line text | Stored on answer/task for reporting |
| **Resident Wording** | Long text | Optional; used for Neighbourhood Voice / resident-facing inspections instead of Question Text |
| **Helper Text** | Long text | Short examples or guidance, e.g. “If you see overflowing bins, select No and take a photo.” |

### People Table
| Field | Type | Description |
|-------|------|-------------|
| Record ID | Single line text | Unique ID |
| Name | Single line text | Person name |
| Email | Email | Email address |
| Role | Single line text | Job role |
| Category | Single select | Category (optional) |
| Active | Checkbox | Is person active |

## Environment Variables

```env
# Airtable Configuration
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_API_KEY=your_api_key

# Category Email Addresses
REPAIRS_EMAIL=repairs@example.com
GROUNDS_EMAIL=grounds@example.com
CLEANING_EMAIL=cleaning@example.com
ASB_EMAIL=asb@example.com
HEALTH_SAFETY_EMAIL=healthsafety@example.com
FIRE_SAFETY_EMAIL=firesafety@example.com
OTHER_EMAIL=actions@example.com
```

## Files Created/Updated

### New Files
- `lib/airtable-client.js` - Airtable API client with models
- `lib/template-rules.js` - Template rules engine

### Updated Files
- `lib/airtable.js` - Uses Airtable client
- `lib/caretaker-template.js` - Uses template rules
- `app/api/airtable/*` - All routes use Airtable client
- `app/(app)/inspections/[id]/section/[sectionId]/page.jsx` - Uses template rules
- `app/api/inspections/[id]/submit/route.js` - Uses template structure

## How It Works

1. **Template Loading**
   - Templates loaded from Airtable
   - Sections loaded for selected template
   - Questions loaded for each section

2. **Caretaker Cleaning Questions**
   - Yes/No questions with `action_category = 'cleaning'`
   - When "No": require comment + photo, create action

3. **ASB/H&S/Fire Sections**
   - Section has `section_type = 'asb'/'health_safety'/'fire_safety'`
   - Trigger Yes/No question (detected by patterns or flag)
   - When trigger = "Yes":
     - Show photo+comment question (required)
     - Show recipient selector (required)
     - Create action with section category

4. **Validation**
   - Template rules engine validates all requirements
   - Conditional questions only validated if visible

5. **PDF Generation**
   - Uses template structure to generate PDF
   - Includes all sections and questions
   - Shows conditional sections based on answers

6. **Email Routing**
   - Actions grouped by category from template
   - Category emails sent to appropriate inboxes
   - Targeted emails for ASB/H&S/Fire recipients

All functionality is implemented and ready! Configure your Airtable tables and set environment variables. 🚀
