<script setup lang="ts">
import { computed } from 'vue'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

type Participant = { id: string; name: string; isCurrentUser: boolean }
type ScorePoint = {
  participantId: string
  seasonIndex: number
  cumulativePoints: number
}

const props = defineProps<{
  participants: Participant[]
  series: ScorePoint[]
  startYear: number
}>()

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

function seasonName(index: number) {
  const start = props.startYear + index
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

const options = computed(() => {
  const seasonIndices = [...new Set(props.series.map(item => item.seasonIndex))].sort((a, b) => a - b)
  return {
    color: ['#9bb45c', '#c4a47f'],
    grid: { left: 36, right: 12, top: 28, bottom: 26 },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} pts` },
    legend: { top: 0, right: 0, itemWidth: 9, itemHeight: 9, textStyle: { color: '#81897a', fontSize: 9 } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: seasonIndices.map(seasonName),
      axisLabel: { color: '#969d8f', fontSize: 8 },
      axisLine: { lineStyle: { color: '#e9ebe3' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { color: '#969d8f', fontSize: 8 },
      splitLine: { lineStyle: { color: '#eff0eb', type: 'dashed' } },
    },
    series: props.participants.map(participant => ({
      name: participant.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: participant.isCurrentUser ? 3 : 2 },
      areaStyle: participant.isCurrentUser ? { opacity: 0.06 } : undefined,
      data: seasonIndices.map(index =>
        props.series.find(item => item.participantId === participant.id && item.seasonIndex === index)?.cumulativePoints ?? 0,
      ),
    })),
  }
})
</script>

<template>
  <VChart v-if="series.length" class="score-chart" :option="options" autoresize />
  <div v-else class="chart-empty">Your score history will appear here after the first result is recorded.</div>
</template>
