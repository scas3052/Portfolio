import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocks } from '../../src/finance/components/agent/markdownBlocks.js'

test('paragraphs, lists and headings keep their old shape', () => {
  assert.deepEqual(blocks('## This month\nYou spent **₹1,146** on food.\nThat is fine.\n\n- Rent ₹18,000\n- EMI ₹4,250\n\n1. one\n2. two\n---\nDone'), [
    { type: 'p', lines: ['This month', 'You spent **₹1,146** on food.', 'That is fine.'], closed: true },
    { type: 'list', ordered: false, items: ['Rent ₹18,000', 'EMI ₹4,250'], closed: true },
    { type: 'list', ordered: true, items: ['one', 'two'] },
    { type: 'p', lines: ['Done'] },
  ])
  assert.deepEqual(blocks(''), [])
  assert.deepEqual(blocks(null), [])
})

test('pipe tables become table blocks with alignment', () => {
  const [intro, table, outro] = blocks('Here you go:\n| Category | Spent | Share |\n|:---|---:|:---:|\n| Food | ₹1,146 | 16% |\n| Bills | **₹2,300** | 33% |\nMostly bills.')
  assert.deepEqual(intro, { type: 'p', lines: ['Here you go:'] })
  assert.deepEqual(table, {
    type: 'table',
    head: ['Category', 'Spent', 'Share'],
    align: [null, 'right', 'center'],
    rows: [
      ['Food', '₹1,146', '16%'],
      ['Bills', '**₹2,300**', '33%'],
    ],
  })
  assert.deepEqual(outro, { type: 'p', lines: ['Mostly bills.'] })
})

test('tables without outer pipes, ragged rows and repeated rules still read', () => {
  const [table, after] = blocks('Who | Owes\n---|---\nRavi | ₹1,500\nSneha')
  assert.deepEqual(table.head, ['Who', 'Owes'])
  assert.deepEqual(table.rows, [['Ravi', '₹1,500']])
  assert.deepEqual(after, { type: 'p', lines: ['Sneha'] })

  const [ragged, tail] = blocks('| A | B |\n| --- | --- |\n| 1 |\n| 2 | 3 | 4 |\n|---|---|\n\nArjun | ₹800')
  assert.deepEqual(ragged.rows, [['1'], ['2', '3', '4']])
  assert.equal(ragged.closed, true)
  assert.deepEqual(tail, { type: 'p', lines: ['Arjun | ₹800'] })
})

test('a half-streamed table shows as text until its rule arrives', () => {
  assert.deepEqual(blocks('| Category | Spent |'), [{ type: 'p', lines: ['Category | Spent'] }])
  assert.deepEqual(blocks('| Category | Spent |\n|---'), [{ type: 'table', head: ['Category', 'Spent'], align: [null], rows: [] }])
  assert.deepEqual(blocks('| Category | Spent |\n|---|---|\n| Food | ₹1,1').at(-1).rows, [['Food', '₹1,1']])
})

test('stray rules and lone pipes do not make tables', () => {
  assert.deepEqual(blocks('|---|---|\nNothing here'), [{ type: 'p', lines: ['Nothing here'] }])
  assert.deepEqual(blocks('Food | ₹1,146\nRent | ₹18,000'), [{ type: 'p', lines: ['Food | ₹1,146', 'Rent | ₹18,000'] }])
  assert.deepEqual(blocks('Totals\n---\nmore'), [{ type: 'p', lines: ['Totals', 'more'] }])
})
