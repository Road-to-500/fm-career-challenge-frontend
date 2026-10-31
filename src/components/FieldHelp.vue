<script setup lang="ts">
import { onMounted, onUpdated, ref, useId } from 'vue'

const props = defineProps<{ example?: string; for?: string }>()
const expanded = ref(false)
const help = ref<HTMLElement>()
const helpId = useId()

function describeField() {
  const label = help.value?.closest('label')
  const field = props.for ? document.getElementById(props.for)
    : label?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
  if (!field) return
  const name = Array.from(label?.childNodes ?? [])
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent)
    .join(' ').trim()
  if (name && !field.hasAttribute('aria-labelledby')) field.setAttribute('aria-label', name)
  const descriptions = new Set((field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean))
  descriptions.add(helpId)
  field.setAttribute('aria-describedby', Array.from(descriptions).join(' '))
}

onMounted(describeField)
onUpdated(describeField)
</script>

<template>
  <span :id="helpId" ref="help" class="field-help">
    <small><slot /></small>
    <button
      v-if="example"
      type="button"
      class="field-help-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >{{ expanded ? 'Less' : 'More' }}</button>
    <small v-if="expanded && example" class="field-help-example">{{ example }}</small>
  </span>
</template>
