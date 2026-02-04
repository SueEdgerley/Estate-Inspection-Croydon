# Auto-Create Actions from Yes/No Questions

## ✅ Implementation Complete

### Default Rule Implemented
**When Yes/No = No → Automatically create an action:**
- **Category**: `grounds_maintenance` (default)
- **Title**: Uses section name (e.g., "Section 1 - Action Required")
- **Photo Required**: `true` (always required for auto-created actions)
- **Status**: `open`
- **Auto-created flag**: `true` (to distinguish from manually created actions)

## How It Works

### 1. Database Schema
**Table**: `actions`
- Stores all actions (both manual and auto-created)
- Links to inspections via `inspection_id`
- Tracks which section/question triggered the action
- `requires_photo` flag for photo requirement
- `auto_created` flag to identify auto-generated actions

### 2. Logic Flow

1. **User answers Yes/No question** in inspection section
2. **Answer is stored** in component state
3. **On "Save" or "Next"**:
   - Section data is saved
   - `processSectionAnswers()` is called
   - Checks all answers for `false`, `'no'`, or `'No'`
   - For each "No" answer:
     - Creates action with type `grounds_maintenance`
     - Sets `requires_photo = true`
     - Sets `auto_created = true`
     - Links to inspection and section
4. **User is notified** of created actions

### 3. Files Created/Updated

#### `lib/actions.js`
- `createActionFromNoAnswer()` - Creates action from "No" answer
- `processSectionAnswers()` - Processes all answers and creates actions
- Action type constants and labels

#### `lib/db.js`
- Added `actions` table schema
- Foreign key to `inspections` table
- Fields for photo requirement and auto-creation flag

#### `app/api/actions/route.js`
- GET endpoint to fetch all actions
- POST endpoint to create new actions
- Handles both manual and auto-created actions

#### `app/(app)/inspections/[id]/section/[sectionId]/page.jsx`
- Added `handleYesNoAnswer()` function
- Updated `handleSave()` to process answers
- Shows warning when "No" is selected
- Displays created actions after save

## Usage Example

```javascript
// In a section component
const handleYesNoAnswer = (questionId, answer) => {
  setAnswers(prev => ({
    ...prev,
    [questionId]: answer
  }))
}

// When saving section
const newActions = await processSectionAnswers(
  inspectionId,
  sectionId,
  'Section 1',
  answers // { question1: false, question2: true, ... }
)
// Returns array of created actions
```

## Customization

### Change Default Action Type
In `lib/actions.js`, change:
```javascript
type: ACTION_TYPES.GROUNDS_MAINTENANCE, // Change to REPAIRS or CLEANING
```

### Change Action Title Format
In `lib/actions.js`, modify:
```javascript
title: `${sectionName} - Action Required`, // Customize format
```

### Disable Photo Requirement
In `lib/actions.js`, change:
```javascript
requires_photo: true, // Set to false
```

## Future Enhancements

- [ ] Allow different action types per question
- [ ] Custom action titles per question
- [ ] Photo upload in section (before action creation)
- [ ] Action preview before creation
- [ ] Bulk action creation for multiple "No" answers

## Testing

1. Go to an inspection section
2. Answer a Yes/No question as "No"
3. Click "Save Draft"
4. Check that action was created
5. Verify action appears in `/actions` page
6. Confirm action requires photo

The logic is ready to use! 🚀
