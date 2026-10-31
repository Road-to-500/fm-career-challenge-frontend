<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number | null
  startYear: number
  minIndex?: number
  maxIndex?: number
  includeUnset?: boolean
  unsetLabel?: string
  required?: boolean
}>(), {
  minIndex: 0,
  maxIndex: 100,
  includeUnset: false,
  unsetLabel: 'Not recorded',
})

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const options = computed(() => {
  const maximum = Math.max(props.minIndex, props.maxIndex, props.modelValue ?? 0)
  return Array.from({ length: maximum - props.minIndex + 1 }, (_, offset) => props.minIndex + offset)
})

function displaySeason(index: number) {
  const start = props.startYear + index
  return `${start}/${String((start + 1) % 100).padStart(2, '0')} — Season ${index + 1}`
}

function update(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value === '' ? null : Number(value))
}
</script>

<template>
  <select :value="modelValue ?? ''" :required="required" @change="update">
    <option v-if="includeUnset" value="">{{ unsetLabel }}</option>
    <option v-for="index in options" :key="index" :value="index">{{ displaySeason(index) }}</option>
  </select>
</template>
