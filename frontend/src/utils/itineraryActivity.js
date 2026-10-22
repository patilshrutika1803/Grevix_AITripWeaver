export const initialAttractionEditorState = {
  editingIndex: null,
  draft: null,
  error: '',
  saving: false,
}

export function attractionEditorReducer(state, action) {
  switch (action.type) {
    case 'edit':
      return { editingIndex: action.index, draft: action.draft, error: '', saving: false }
    case 'change':
      return state.draft
        ? { ...state, draft: { ...state.draft, [action.field]: action.value } }
        : state
    case 'saving':
      return { ...state, error: '', saving: true }
    case 'save-failed':
      return { ...state, error: action.error, saving: false }
    case 'saved':
    case 'cancel':
      return state.saving && action.type === 'cancel'
        ? state
        : { ...initialAttractionEditorState }
    default:
      return state
  }
}

export function validateAttractionDraft(draft) {
  if (!draft.title.trim()) return 'Enter an activity title.'
  if (!draft.time.trim()) return 'Enter a time for this activity.'
  const costText = draft.cost.trim()
  const cost = Number(costText)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(costText) || !Number.isFinite(cost) || cost < 0) {
    return 'Cost must be a non-negative number with up to two decimal places.'
  }
  if (draft.title.trim().length > 300 || draft.time.trim().length > 300 || draft.description.length > 2000) {
    return 'One or more values are too long.'
  }
  return ''
}
