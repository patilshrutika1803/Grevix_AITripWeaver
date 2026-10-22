import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMessageTimestamp } from '../src/components/group/groupDisplay.js'

test('new UTC message timestamps display in the user local timezone', () => {
  const timestamp = '2026-07-01T12:00:00Z'
  const timeZone = 'America/Los_Angeles'

  assert.equal(
    formatMessageTimestamp(timestamp, timeZone),
    new Date(timestamp).toLocaleString(undefined, { timeZone }),
  )
})

test('timestamps with explicit offsets resolve to the same local instant', () => {
  const timeZone = 'America/Los_Angeles'

  assert.equal(
    formatMessageTimestamp('2026-07-01T17:30:00+05:30', timeZone),
    new Date('2026-07-01T12:00:00Z').toLocaleString(undefined, { timeZone }),
  )
})

test('invalid and missing message timestamps render no misleading time', () => {
  assert.equal(formatMessageTimestamp('', 'America/Los_Angeles'), '')
  assert.equal(formatMessageTimestamp(null, 'America/Los_Angeles'), '')
  assert.equal(formatMessageTimestamp('not-a-timestamp', 'America/Los_Angeles'), '')
})
