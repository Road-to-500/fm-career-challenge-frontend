import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FieldHelp from './FieldHelp.vue'
import SeasonSelect from './SeasonSelect.vue'

describe('shared field guidance', () => {
  it('explicitly associates sibling help with a separately labelled control', async () => {
    const view = mount({
      components: { FieldHelp },
      template: '<div><label for="test-profile">Public name</label><input id="test-profile" /><FieldHelp for="test-profile" example="A manager name">Shown to your rival.</FieldHelp></div>',
    }, { attachTo: document.body })
    expect(view.get('input').attributes('aria-describedby')).toBe(view.get('.field-help').attributes('id'))
    expect(view.get('input').attributes('aria-label')).toBeUndefined()
    await view.get('button').trigger('click')
    expect(view.get('input').attributes('aria-describedby')).toBe(view.get('.field-help').attributes('id'))
    view.unmount()
  })

  it('keeps the field name separate from its expandable description', async () => {
    const view = mount({
      components: { FieldHelp },
      template: '<label>League points<input aria-describedby="existing-help" /><FieldHelp example="Three points for a win.">League points, not challenge points.</FieldHelp></label>',
    })
    expect(view.get('input').attributes('aria-label')).toBe('League points')
    expect(view.get('input').attributes('aria-describedby')).toContain('existing-help')
    expect(view.get('input').attributes('aria-describedby')).toContain(view.get('.field-help').attributes('id'))
    await view.get('button').trigger('click')
    expect(view.get('input').attributes('aria-label')).toBe('League points')
  })

  it('keeps instructions visible and reveals additional context on demand', async () => {
    const view = mount(FieldHelp, { props: { example: 'For example, enter the current FM season.' }, slots: { default: 'Use an in-game season.' } })
    expect(view.text()).toContain('Use an in-game season.')
    expect(view.text()).not.toContain('For example')
    await view.get('button').trigger('click')
    expect(view.text()).toContain('For example')
    expect(view.get('button').attributes('aria-expanded')).toBe('true')
  })

  it('shows readable seasons and preserves the zero-based API index', async () => {
    const view = mount(SeasonSelect, {
      props: { modelValue: 0, startYear: 2026, minIndex: 0, maxIndex: 2 },
    })
    expect(view.findAll('option').map(option => option.text())).toEqual([
      '2026/27 — Season 1',
      '2027/28 — Season 2',
      '2028/29 — Season 3',
    ])
    await view.get('select').setValue('2')
    expect(view.emitted('update:modelValue')?.[0]).toEqual([2])
  })

  it('supports an unset optional season without shifting season indices', async () => {
    const view = mount(SeasonSelect, {
      props: { modelValue: null, startYear: 2026, maxIndex: 1, includeUnset: true },
    })
    await view.get('select').setValue('')
    expect(view.emitted('update:modelValue')?.[0]).toEqual([null])
  })

  it('offers every supported season through index 100 and retains a saved optional end', async () => {
    const view = mount(SeasonSelect, { props: { modelValue: 100, startYear: 2026, maxIndex: 100, includeUnset: true } })
    expect(view.findAll('option')).toHaveLength(102)
    expect(view.get('select').element.value).toBe('100')
    expect(view.findAll('option').at(-1)!.text()).toBe('2126/27 — Season 101')
    await view.get('select').setValue('')
    expect(view.emitted('update:modelValue')?.[0]).toEqual([null])
  })
})
