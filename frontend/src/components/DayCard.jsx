import { useEffect, useReducer, useState } from 'react'
import PlaceDetailModal from './PlaceDetailModal'
import { formatCurrency } from '../utils/currency'
import {
  attractionEditorReducer,
  initialAttractionEditorState,
  validateAttractionDraft,
} from '../utils/itineraryActivity'
import './DayCard.css'

const DAY_THEMES = [
  'linear-gradient(135deg, #6c63ff20, #00d4aa10)',
  'linear-gradient(135deg, #ff6b6b20, #f5a62310)',
  'linear-gradient(135deg, #00d4aa20, #6c63ff10)',
  'linear-gradient(135deg, #f5a62320, #ff6b6b10)',
]

export default function DayCard({ day, index, currency, onRegenerate, regeneratingDay = null, onUpdateAttraction }) {
  const [open, setOpen] = useState(true)
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [attractionEditor, dispatchAttractionEditor] = useReducer(
    attractionEditorReducer,
    initialAttractionEditorState,
  )

  const {
    day_number, theme, hotel, meals = [],
    attractions = [], transport, activities = [],
  } = day

  const categoryIcon = (cat = '') => {
    const l = cat.toLowerCase()
    if (l.includes('beach'))    return '🏖️'
    if (l.includes('fort') || l.includes('heritage')) return '🏰'
    if (l.includes('waterfall') || l.includes('nature')) return '🌊'
    if (l.includes('market') || l.includes('shop'))  return '🛍️'
    if (l.includes('temple') || l.includes('church')) return '⛪'
    if (l.includes('food') || l.includes('rest'))   return '🍽️'
    return '📍'
  }

  const mealIcon = (type = '') => {
    if (type.toLowerCase().includes('break')) return '☀️'
    if (type.toLowerCase().includes('lunch')) return '🌤️'
    return '🌙'
  }

  const extractNumber = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const match = String(str).match(/[\d,.]+/);
    if (match) {
      return parseFloat(match[0].replace(/,/g, ''));
    }
    return 0;
  }

  const displayEntryFee = (value) => {
    if (value === undefined || value === null || value === '') return 'Unknown'
    return /\d/.test(String(value)) ? formatCurrency(extractNumber(value), currency) : value
  }

  const beginEditingAttraction = (attraction, attractionIndex) => {
    dispatchAttractionEditor({
      type: 'edit',
      index: attractionIndex,
      draft: {
        title: attraction.place?.name || '',
        description: attraction.place?.description || '',
        time: attraction.timing || '',
        cost: String(extractNumber(attraction.place?.entry_fee)),
      },
    })
  }

  const cancelEditingAttraction = () => {
    dispatchAttractionEditor({ type: 'cancel' })
  }

  const saveAttraction = async (event) => {
    event.preventDefault()
    const validationError = validateAttractionDraft(attractionEditor.draft)
    if (validationError) {
      dispatchAttractionEditor({ type: 'save-failed', error: validationError })
      return
    }

    dispatchAttractionEditor({ type: 'saving' })
    try {
      await onUpdateAttraction(day_number, attractionEditor.editingIndex, {
        title: attractionEditor.draft.title.trim(),
        description: attractionEditor.draft.description.trim(),
        time: attractionEditor.draft.time.trim(),
        cost: Number(attractionEditor.draft.cost),
      })
      dispatchAttractionEditor({ type: 'saved' })
    } catch (error) {
      dispatchAttractionEditor({
        type: 'save-failed',
        error: error?.status === 404
          ? 'This activity is unavailable or you do not have permission to edit the trip.'
          : error?.message || 'Unable to save this activity. Please try again.',
      })
    }
  }

  const calculatedTotal =
    extractNumber(hotel?.price_per_night) +
    attractions.reduce((sum, attr) => sum + extractNumber(attr.place?.entry_fee), 0) +
    meals.reduce((sum, m) => sum + extractNumber(m.estimated_cost), 0) +
    extractNumber(transport?.estimated_cost);

  useEffect(() => {
    if (!selectedPlace) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedPlace(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedPlace])

  return (
    <div
      className="day-card fade-in-up"
      style={{ animationDelay: `${index * 0.12}s`, background: DAY_THEMES[index % DAY_THEMES.length] }}
    >
      {/* Day header — always visible */}
      <div className="day-header">
        <button type="button" className="day-header-toggle" onClick={() => setOpen(o => !o)}>
          <div className="day-number-badge">Day {day_number}</div>
          <div className="day-header-center">
            <h3 className="day-theme">{theme}</h3>
            <div className="day-tags">
              {activities.slice(0, 3).map(a => (
                <span key={a} className="day-tag">{a}</span>
              ))}
            </div>
          </div>
          <div className="day-header-right">
            <span className="day-cost">{formatCurrency(calculatedTotal, currency)}</span>
            <span className={`chevron ${open ? 'open' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </div>
        </button>
        {onRegenerate && <button type="button" className="text-button" onClick={() => onRegenerate(day_number)} disabled={regeneratingDay !== null} aria-busy={regeneratingDay === day_number}>{regeneratingDay === day_number ? 'Regenerating...' : 'Regenerate'}</button>}
      </div>

      {/* Collapsible body */}
      {open && (
        <div className="day-body">
          {/* Hotel */}
          <div className="day-section">
            <div className="section-icon">🏨</div>
            <div className="section-content">
              <p className="section-title">Accommodation</p>
              <p className="section-main">{hotel?.name}</p>
              <p className="section-sub">{hotel?.price_per_night}/night · {hotel?.stars}★</p>
            </div>
          </div>

          {/* Attractions */}
          <div className="day-section">
            <div className="section-icon">📍</div>
            <div className="section-content full">
              <p className="section-title">Attractions</p>
              <div className="attractions-list">
                {attractions.map((attr, i) => (
                  <div className="attraction-entry" key={i}>
                    <button
                      type="button"
                      className="attraction-item"
                      onClick={() => attr.place?.name && setSelectedPlace({ place: attr.place, timing: attr.timing })}
                      disabled={!attr.place?.name}
                    >
                      <span className="attr-icon">{categoryIcon(attr.place?.category)}</span>
                      <div className="attr-info">
                        <p className="attr-name">{attr.place?.name}</p>
                        <p className="attr-meta">{attr.timing} · {displayEntryFee(attr.place?.entry_fee)}</p>
                      </div>
                      <span className="attr-dur">{attr.place?.recommended_duration_hours}h</span>
                    </button>
                    {onUpdateAttraction && attr.place?.name && attractionEditor.editingIndex !== i && (
                      <button
                        type="button"
                        className="text-button attraction-edit-button"
                        onClick={() => beginEditingAttraction(attr, i)}
                        aria-label={`Edit ${attr.place.name}`}
                      >
                        Edit
                      </button>
                    )}
                    {attractionEditor.editingIndex === i && attractionEditor.draft && (
                      <form className="attraction-editor" onSubmit={saveAttraction} noValidate>
                        <label>
                          Title
                          <input
                            required
                            maxLength={300}
                            value={attractionEditor.draft.title}
                            onChange={event => dispatchAttractionEditor({ type: 'change', field: 'title', value: event.target.value })}
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            maxLength={2000}
                            rows={2}
                            value={attractionEditor.draft.description}
                            onChange={event => dispatchAttractionEditor({ type: 'change', field: 'description', value: event.target.value })}
                          />
                        </label>
                        <label>
                          Time
                          <input
                            required
                            maxLength={300}
                            value={attractionEditor.draft.time}
                            onChange={event => dispatchAttractionEditor({ type: 'change', field: 'time', value: event.target.value })}
                          />
                        </label>
                        <label>
                          Cost ({currency})
                          <input
                            required
                            type="number"
                            min="0"
                            max="9999999999.99"
                            step="0.01"
                            value={attractionEditor.draft.cost}
                            onChange={event => dispatchAttractionEditor({ type: 'change', field: 'cost', value: event.target.value })}
                          />
                        </label>
                        {attractionEditor.error && <p className="form-error attraction-editor-error" role="alert">{attractionEditor.error}</p>}
                        <div className="attraction-editor-actions">
                          <button type="submit" className="button button-primary" disabled={attractionEditor.saving}>
                            {attractionEditor.saving ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" className="button button-quiet" onClick={cancelEditingAttraction} disabled={attractionEditor.saving}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Meals */}
          <div className="day-section">
            <div className="section-icon">🍽️</div>
            <div className="section-content full">
              <p className="section-title">Meals</p>
              <div className="meals-grid">
                {meals.map((m, i) => (
                  <div key={i} className="meal-item">
                    <span className="meal-icon">{mealIcon(m.meal_type)}</span>
                    <div className="meal-info">
                      <p className="meal-type">{m.meal_type}</p>
                      <p className="meal-name">{m.restaurant_name}</p>
                    </div>
                    <span className="meal-cost">{m.estimated_cost}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transport */}
          <div className="day-section">
            <div className="section-icon">🚗</div>
            <div className="section-content">
              <p className="section-title">Transport</p>
              <p className="section-main">{transport?.mode}</p>
              <p className="section-sub">{transport?.estimated_cost}</p>
            </div>
          </div>
        </div>
      )}

      {selectedPlace && (
        <PlaceDetailModal
          place={selectedPlace.place}
          timing={selectedPlace.timing}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </div>
  )
}
