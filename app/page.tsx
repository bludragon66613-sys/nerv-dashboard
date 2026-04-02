'use client'
import { apiFetch } from '@/lib/client-auth'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Skill, Run, LLMProvider, Secret } from '@/lib/types'
import { MODELS } from '@/lib/theme'
import { utcToLocal, localToUtc, getUtcOffsetMinutes, getLocalTzAbbr } from '@/lib/utils'

const DAYS = [
  { label: 'All', value: -1 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
]

function parseCron(cron: string): { mode: 'interval'; value: number; unit: 'm' | 'h' } | { mode: 'time'; hour12: number; minute: number; ampm: 'AM' | 'PM'; days: number[] } {
  const parts = cron.split(' ')
  const m = parts[0]
  const h = parts[1]
  const dow = parts[4]
  if (m.includes('/')) {
    return { mode: 'interval', value: parseInt(m.split('/')[1]) || 5, unit: 'm' }
  }
  if (h === '*' || h.includes('/')) {
    return { mode: 'interval', value: h === '*' ? 1 : parseInt(h.split('/')[1]) || 1, unit: 'h' }
  }
  const utcH = parseInt(h)
  const utcM = parseInt(m) || 0
  const local = utcToLocal(utcH, utcM)
  const localH = local.h
  return {
    mode: 'time',
    hour12: localH > 12 ? localH - 12 : localH === 0 ? 12 : localH,
    minute: local.m,
    ampm: localH >= 12 ? 'PM' : 'AM',
    days: dow === '*' ? [-1] : dow.split(',').map(d => parseInt(d)).filter(d => !isNaN(d)),
  }
}

function cronLabel(cron: string): string {
  const p = parseCron(cron)
  if (p.mode === 'interval') return `Every ${p.value}${p.unit}`
  const time = `${p.hour12}:${String(p.minute).padStart(2, '0')} ${p.ampm}`
  if (p.days.includes(-1)) return `${time} daily`
  const dayNames = p.days.map(d => DAYS.find(x => x.value === d)?.label || '').filter(Boolean)
  return `${time} ${dayNames.join(',')}`
}

function buildCron(mode: 'interval' | 'time', intervalValue: number, intervalUnit: 'm' | 'h', hour12: number, minute: number, ampm: 'AM' | 'PM', days: number[]): string {
  if (mode === 'interval') return intervalUnit === 'm' ? `*/${intervalValue} * * * *` : `0 */${intervalValue} * * *`
  let localH = hour12
  if (ampm === 'PM' && localH !== 12) localH += 12
  if (ampm === 'AM' && localH === 12) localH = 0
  const utc = localToUtc(localH, minute)
  const dowField = days.includes(-1) ? '*' : days.sort((a, b) => a - b).join(',')
  return `${utc.m} ${utc.h} * * ${dowField}`
}

function ScheduleEditor({ cron, onSave }: { cron: string; onSave: (cron: string) => void }) {
  const parsed = parseCron(cron)
  const [mode, setMode] = useState<'interval' | 'time'>(parsed.mode)
  const [intervalValue, setIntervalValue] = useState(parsed.mode === 'interval' ? parsed.value : 3)
  const [intervalUnit, setIntervalUnit] = useState<'m' | 'h'>(parsed.mode === 'interval' ? parsed.unit : 'h')
  const [hour12, setHour12] = useState(parsed.mode === 'time' ? parsed.hour12 : 7)
  const [minute, setMinute] = useState(parsed.mode === 'time' ? parsed.minute : 0)
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(parsed.mode === 'time' ? parsed.ampm : 'AM')
  const [days, setDays] = useState<number[]>(parsed.mode === 'time' ? parsed.days : [-1])

  const toggleDay = (value: number) => {
    setMode('time')
    if (value === -1) {
      setDays([-1])
      return
    }
    const without = days.filter(d => d !== -1 && d !== value)
    if (days.includes(value)) {
      setDays(without.length === 0 ? [-1] : without)
    } else {
      setDays([...without, value])
    }
  }

  const apply = () => onSave(buildCron(mode, intervalValue, intervalUnit, hour12, minute, ampm, days))

  return (
    <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/30 flex flex-wrap items-center gap-x-4 gap-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Interval */}
      <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
        <input type="radio" name="sched-mode" checked={mode === 'interval'} onChange={() => setMode('interval')} className="accent-green-500 w-3 h-3" />
        <span className="text-[10px] text-zinc-400">Every</span>
        <input
          type="number" min={1} max={intervalUnit === 'm' ? 59 : 24} value={intervalValue}
          onFocus={() => setMode('interval')}
          onChange={(e) => { setIntervalValue(Math.max(1, Math.min(intervalUnit === 'm' ? 59 : 24, parseInt(e.target.value) || 1))); setMode('interval') }}
          className="w-10 bg-zinc-800 text-zinc-200 text-[10px] rounded px-1.5 py-0.5 border border-zinc-700/50 outline-none text-center font-mono"
        />
        <div className="flex text-[10px] rounded overflow-hidden border border-zinc-700/50">
          <button type="button" onClick={() => { setIntervalUnit('m'); setMode('interval') }}
            className={`px-1.5 py-0.5 ${intervalUnit === 'm' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>m</button>
          <button type="button" onClick={() => { setIntervalUnit('h'); setMode('interval') }}
            className={`px-1.5 py-0.5 ${intervalUnit === 'h' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>h</button>
        </div>
      </label>

      <span className="text-zinc-700">|</span>

      {/* Time */}
      <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
        <input type="radio" name="sched-mode" checked={mode === 'time'} onChange={() => setMode('time')} className="accent-green-500 w-3 h-3" />
        <span className="text-[10px] text-zinc-400">At</span>
        <input
          type="number" min={1} max={12} value={hour12}
          onFocus={() => setMode('time')}
          onChange={(e) => { setHour12(Math.max(1, Math.min(12, parseInt(e.target.value) || 1))); setMode('time') }}
          className="w-10 bg-zinc-800 text-zinc-200 text-[10px] rounded px-1.5 py-0.5 border border-zinc-700/50 outline-none text-center font-mono"
        />
        <span className="text-[10px] text-zinc-400">:</span>
        <input
          type="number" min={0} max={59} value={String(minute).padStart(2, '0')}
          onFocus={() => setMode('time')}
          onChange={(e) => { setMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0))); setMode('time') }}
          className="w-10 bg-zinc-800 text-zinc-200 text-[10px] rounded px-1.5 py-0.5 border border-zinc-700/50 outline-none text-center font-mono"
        />
        <div className="flex text-[10px] rounded overflow-hidden border border-zinc-700/50">
          <button type="button" onClick={() => { setAmpm('AM'); setMode('time') }}
            className={`px-1.5 py-0.5 ${ampm === 'AM' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>AM</button>
          <button type="button" onClick={() => { setAmpm('PM'); setMode('time') }}
            className={`px-1.5 py-0.5 ${ampm === 'PM' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>PM</button>
        </div>
      </label>

      {/* Day pills — multi-select */}
      {mode === 'time' && (
        <div className="flex gap-0.5 shrink-0">
          {DAYS.map(d => (
            <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                (d.value === -1 ? days.includes(-1) : days.includes(d.value))
                  ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}>{d.label}</button>
          ))}
        </div>
      )}

      {/* Apply */}
      <button type="button" onClick={apply} className="bg-[#ff6600]/20 hover:bg-[#ff6600]/30 text-[#ff6600] text-[10px] px-2.5 py-0.5 rounded-none border border-[#ff6600]/50 transition-colors ml-auto shrink-0">
        Apply
      </button>
    </div>
  )
}

function VarEditor({ value: initial, onSave }: { value: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial)

  return (
    <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/30 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] text-zinc-500 shrink-0">Var</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(value)}
        placeholder="e.g. AI, bitcoin, owner/repo"
        className="flex-1 bg-zinc-800 text-zinc-200 text-[10px] rounded px-2 py-1 border border-zinc-700/50 outline-none placeholder:text-zinc-600 font-mono"
      />
      <button
        type="button"
        onClick={() => onSave(value)}
        disabled={value === initial}
        className="bg-[#ff6600]/20 hover:bg-[#ff6600]/30 text-[#ff6600] text-[10px] px-2.5 py-0.5 rounded-none border border-[#ff6600]/50 transition-colors disabled:opacity-30 shrink-0"
      >
        Save
      </button>
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); onSave('') }}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function Dashboard() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [repo, setRepo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')
  const [editingSecret, setEditingSecret] = useState<string | null>(null)
  const [secretValue, setSecretValue] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openSchedule, setOpenSchedule] = useState<string | null>(null)
  const [addingSecret, setAddingSecret] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')

  // Run logs viewer
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [runLogs, setRunLogs] = useState('')
  const [runSummary, setRunSummary] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [showFullLogs, setShowFullLogs] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Import modal
  const [showImport, setShowImport] = useState(false)
  const [openclawStatus, setOpenclawStatus] = useState<'idle' | 'checking' | 'fixing' | 'ok' | 'fail'>('idle')
  const [openclawChecks, setOpenclawChecks] = useState<Array<{ name: string; status: string; detail: string }>>([])
  const [showOpenclawPanel, setShowOpenclawPanel] = useState(false)

  const checkOpenclaw = useCallback(async () => {
    setOpenclawStatus('checking')
    try {
      const res = await apiFetch('/api/openclaw')
      const data = await res.json()
      setOpenclawChecks(data.checks)
      setOpenclawStatus(data.status === 'healthy' ? 'ok' : 'fail')
      setShowOpenclawPanel(true)
    } catch {
      setOpenclawStatus('fail')
      setOpenclawChecks([{ name: 'Connection', status: 'fail', detail: 'API unreachable' }])
      setShowOpenclawPanel(true)
    }
  }, [])

  const fixOpenclaw = useCallback(async () => {
    setOpenclawStatus('fixing')
    try {
      const res = await apiFetch('/api/openclaw', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setToast('OpenClaw fixed successfully')
        await checkOpenclaw()
      } else {
        setOpenclawStatus('fail')
        setToast('Fix completed with issues — check panel')
      }
    } catch {
      setOpenclawStatus('fail')
      setToast('Fix failed — run bash ~/fix-openclaw.sh manually')
    }
  }, [checkOpenclaw, setToast])
  const [importLoading, setImportLoading] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<Array<{ path: string; content: string }>>([])
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auth (Claude auto-connect on load)
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean } | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const autoAuthAttempted = useRef(false)

  // LLM Connect modal
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([])
  const [llmLoading, setLlmLoading] = useState<Record<string, boolean>>({})
  const [llmKeyInputs, setLlmKeyInputs] = useState<Record<string, string>>({})
  const [llmKeyVisible, setLlmKeyVisible] = useState<Set<string>>(new Set())

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const checkAuth = async () => {
    try {
      const res = await apiFetch('/api/auth')
      if (res.ok) setAuthStatus(await res.json())
    } catch { /* ignore */ }
  }

  const setupAuth = async (key?: string) => {
    setAuthLoading(true)
    try {
      const res = await apiFetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key ? { key } : {}),
      })
      if (res.ok) {
        setAuthStatus({ authenticated: true })
        fetchData()
      } else {
        const data = await res.json()
        flash(data.error || 'Auto-setup failed')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  const fetchProviders = async () => {
    try {
      const res = await apiFetch('/api/llm')
      if (res.ok) setLlmProviders((await res.json()).providers)
    } catch { /* ignore */ }
  }

  const connectProvider = async (id: string, key?: string) => {
    setLlmLoading(prev => ({ ...prev, [id]: true }))
    try {
      const res = await apiFetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: id, key }),
      })
      const data = await res.json()
      if (res.ok) {
        setLlmKeyVisible(prev => { const n = new Set(prev); n.delete(id); return n })
        setLlmKeyInputs(prev => ({ ...prev, [id]: '' }))
        flash(`${id} connected`)
        await fetchProviders()
      } else if (data.needsKey) {
        setLlmKeyVisible(prev => new Set(prev).add(id))
      } else {
        flash(data.error || 'Connection failed')
      }
    } finally {
      setLlmLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const checkSync = async () => {
    try {
      const res = await apiFetch('/api/sync')
      if (res.ok) setHasChanges((await res.json()).hasChanges)
    } catch { /* ignore */ }
  }

  const syncToGithub = async () => {
    setSyncing(true)
    try {
      const res = await apiFetch('/api/sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        flash(data.message || 'Synced to GitHub')
        setHasChanges(false)
      } else {
        flash('Sync failed — check terminal')
      }
    } finally {
      setSyncing(false)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const [skillsRes, runsRes, secretsRes] = await Promise.all([
        apiFetch('/api/skills'),
        apiFetch('/api/runs'),
        apiFetch('/api/secrets'),
      ])
      if (skillsRes.ok) {
        const data = await skillsRes.json()
        setSkills(data.skills)
        if (data.model) setModel(data.model)
        if (data.repo) setRepo(data.repo)
      }
      if (runsRes.ok) setRuns((await runsRes.json()).runs)
      if (secretsRes.ok) {
        const data = await secretsRes.json()
        if (data.secrets) setSecrets(data.secrets)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
    checkSync()
    checkAuth()
    fetchProviders()
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-check OpenClaw health on load
  useEffect(() => {
    checkOpenclaw()
  }, [checkOpenclaw])

  // --- Skill actions ---

  const updateModel = async (newModel: string) => {
    setModel(newModel)
    try {
      const res = await apiFetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      })
      if (res.ok) {
        flash(`Model set to ${MODELS.find(m => m.id === newModel)?.label || newModel}`)
        checkSync()
      }
    } catch { /* ignore */ }
  }

  const toggleSkill = async (name: string, enabled: boolean) => {
    setBusy(b => ({ ...b, [name]: true }))
    try {
      const res = await apiFetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, enabled }),
      })
      if (res.ok) {
        setSkills(s => s.map(sk => sk.name === name ? { ...sk, enabled } : sk))
        flash(`${name} ${enabled ? 'enabled' : 'disabled'}`)
        checkSync()
      }
    } finally {
      setBusy(b => ({ ...b, [name]: false }))
    }
  }

  const updateSchedule = async (name: string, schedule: string) => {
    setBusy(b => ({ ...b, [`s-${name}`]: true }))
    try {
      const res = await apiFetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schedule }),
      })
      if (res.ok) {
        setSkills(s => s.map(sk => sk.name === name ? { ...sk, schedule } : sk))
        flash(`${name} schedule updated`)
        checkSync()
      }
    } finally {
      setBusy(b => ({ ...b, [`s-${name}`]: false }))
    }
  }

  const refreshRuns = useCallback(async () => {
    try {
      const res = await apiFetch('/api/runs')
      if (res.ok) setRuns((await res.json()).runs)
    } catch { /* ignore */ }
  }, [])

  const viewRunLogs = async (run: Run) => {
    setSelectedRun(run)
    setRunLogs('')
    setRunSummary('')
    setShowFullLogs(false)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/runs/${run.id}/logs`)
      if (res.ok) {
        const data = await res.json()
        setRunSummary(data.summary || '')
        setRunLogs(data.logs || '(No logs)')
      } else {
        setRunLogs('Failed to fetch logs')
      }
    } catch {
      setRunLogs('Failed to fetch logs')
    } finally {
      setLogsLoading(false)
    }
  }

  // Auto-refresh runs every 10s
  useEffect(() => {
    const id = setInterval(refreshRuns, 10_000)
    return () => clearInterval(id)
  }, [refreshRuns])

  // Auto-authenticate once if not authenticated
  useEffect(() => {
    if (authStatus !== null && !authStatus.authenticated && !authLoading && !autoAuthAttempted.current) {
      autoAuthAttempted.current = true
      setupAuth()
    }
  }, [authStatus])

  const updateVar = async (name: string, v: string) => {
    try {
      const res = await apiFetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, var: v }),
      })
      if (res.ok) {
        setSkills(s => s.map(sk => sk.name === name ? { ...sk, var: v } : sk))
        flash(`${name} var updated`)
        checkSync()
      }
    } catch { /* ignore */ }
  }

  const deleteSkill = async (name: string) => {
    setBusy(b => ({ ...b, [`d-${name}`]: true }))
    try {
      const res = await apiFetch('/api/skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setSkills(s => s.filter(sk => sk.name !== name))
        setOpenSchedule(null)
        flash(`${name} deleted`)
        checkSync()
      } else {
        const data = await res.json()
        flash(data.error || 'Delete failed')
      }
    } finally {
      setBusy(b => ({ ...b, [`d-${name}`]: false }))
    }
  }

  const runSkill = async (name: string, v?: string) => {
    setBusy(b => ({ ...b, [`r-${name}`]: true }))
    try {
      const res = await fetch(`/api/skills/${name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ var: v || '', model }),
      })
      if (res.ok) {
        flash(`${name} triggered${v ? ` (${v})` : ''}`)
        // Poll runs a few times so the new run appears quickly
        for (const delay of [2000, 5000, 10000, 20000]) {
          setTimeout(refreshRuns, delay)
        }
      } else {
        const data = await res.json()
        flash(data.error || 'Failed to trigger')
      }
    } finally {
      setBusy(b => ({ ...b, [`r-${name}`]: false }))
    }
  }

  // --- Secret actions ---

  const saveSecret = async (name: string) => {
    if (!secretValue.trim()) return
    setBusy(b => ({ ...b, [`sec-${name}`]: true }))
    try {
      const res = await apiFetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: secretValue.trim() }),
      })
      if (res.ok) {
        setSecrets(s => {
          const exists = s.some(sec => sec.name === name)
          if (exists) return s.map(sec => sec.name === name ? { ...sec, isSet: true } : sec)
          return [...s, { name, group: 'Skill Keys', description: 'Custom secret', isSet: true }]
        })
        setEditingSecret(null)
        setSecretValue('')
        setAddingSecret(false)
        setNewSecretName('')
        flash(`${name} saved`)
      } else {
        const data = await res.json()
        flash(data.error || 'Failed to save')
      }
    } finally {
      setBusy(b => ({ ...b, [`sec-${name}`]: false }))
    }
  }

  const deleteSecret = async (name: string) => {
    setBusy(b => ({ ...b, [`sec-${name}`]: true }))
    try {
      const res = await apiFetch('/api/secrets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setSecrets(s => s.map(sec => sec.name === name ? { ...sec, isSet: false } : sec))
        flash(`${name} removed`)
      }
    } finally {
      setBusy(b => ({ ...b, [`sec-${name}`]: false }))
    }
  }

  // --- Upload actions ---

  const readFilesFromInput = async (fileList: FileList) => {
    const files: Array<{ path: string; content: string }> = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      // webkitRelativePath is set when uploading a folder, otherwise use file.name
      const path = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name
      const content = await file.text()
      files.push({ path, content })
    }
    setUploadFiles(files)
    // Auto-fill name from SKILL.md / .skill frontmatter
    const skillFile = files.find(f => {
      const lower = f.path.toLowerCase()
      return lower === 'skill.md' || lower.endsWith('/skill.md') || lower.endsWith('.skill')
    })
    if (skillFile) {
      const fm = skillFile.content.match(/^---\s*\n([\s\S]*?)\n---/)
      if (fm) {
        const nameMatch = fm[1].match(/name:\s*(.+)/)
        if (nameMatch) {
          const slug = nameMatch[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          if (slug) setUploadName(slug)
        }
      }
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setUploadDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      await readFilesFromInput(e.dataTransfer.files)
    }
  }

  const uploadSkill = async () => {
    if (uploadFiles.length === 0) return
    setImportLoading(true)
    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadFiles, name: uploadName || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        const missing = (data.detectedSecrets as string[] || []).filter(
          (name: string) => !secrets.some(s => s.name === name && s.isSet)
        )
        if (missing.length > 0) {
          flash(`Uploaded "${data.name}" — needs secrets: ${missing.join(', ')}`)
          // Add missing secrets to the list so user can set them
          setSecrets(s => {
            const newSecrets = missing
              .filter((name: string) => !s.some(sec => sec.name === name))
              .map((name: string) => ({ name, group: 'Skill Keys', description: `Required by ${data.name}`, isSet: false }))
            return [...s, ...newSecrets]
          })
        } else {
          flash(`Uploaded skill "${data.name}" (${data.filesWritten} files)`)
        }
        setShowImport(false)
        setUploadFiles([])
        setUploadName('')
        // Refresh skills list but not secrets (detected secrets were just added to local state)
        apiFetch('/api/skills').then(r => r.ok ? r.json() : null).then(d => {
          if (d) { setSkills(d.skills); if (d.model) setModel(d.model); if (d.repo) setRepo(d.repo) }
        })
        checkSync()
      } else {
        const data = await res.json()
        flash(data.error || 'Upload failed')
      }
    } finally {
      setImportLoading(false)
    }
  }

  // --- Render ---

  const enabledCount = skills.filter(s => s.enabled).length
  const secretsSet = secrets.filter(s => s.isSet).length

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full border border-[#ff6600]/20" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
          <div className="absolute h-16 w-16 rounded-full border border-[#ff6600]/20" style={{ animation: 'pulse-ring 2s ease-out infinite 0.6s' }} />
          <div className="absolute h-16 w-16 rounded-full border border-[#ff6600]/20" style={{ animation: 'pulse-ring 2s ease-out infinite 1.2s' }} />
          <div className="h-3 w-3 rounded-full bg-[#ff6600] shadow-[0_0_12px_rgba(255,102,0,0.4)]" />
        </div>
        <div style={{ animation: 'fade-in-up 0.5s ease-out 0.3s both' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-red-400 font-medium mb-2">Connection Error</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#06070d] border border-[#ff6600]/40 border-l-2 border-l-[#ff6600] text-[#a8b4c4] px-4 py-2 rounded-none text-[11px] font-mono tracking-wider shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/50 px-5 py-3 shrink-0" style={{ background: '#06070d' }}>
        <div className="flex items-center justify-between">
          {/* NERV_02 logo */}
          <div className="flex items-center gap-3">
            <div style={{ width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: '15px solid #ff6600', filter: 'drop-shadow(0 0 6px #ff660088)' }} />
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: 6, color: '#ff6600', textShadow: '0 0 10px #ff660044' }}>NERV_02</div>
              <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 3, color: '#2e3848', marginTop: 1 }}>AUTONOMOUS AGENT SYSTEM</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowConnectModal(true); fetchProviders() }}
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#ff6600', border: '1px solid #ff660066', padding: '5px 12px', background: '#ff660010', transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ff660022')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ff660010')}
            >
              {llmProviders.length > 0 && (
                <span style={{ fontSize: 9, color: llmProviders.some(p => p.connected) ? '#00ff88' : '#cc4400' }}>
                  ● {llmProviders.filter(p => p.connected).length}/{llmProviders.length}
                </span>
              )}
              ◈ CONNECT
            </button>
            {repo && (
              <a
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-transparent hover:bg-[#1c2230] text-[#a8b4c4] text-[11px] px-3 py-1.5 rounded-none border border-[#1c2230] font-mono tracking-wider transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                GitHub
              </a>
            )}
            <a
              href="/nerv"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#ff6600', border: '1px solid #ff660066', padding: '5px 12px', textDecoration: 'none', background: '#ff660010', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ff660022')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ff660010')}
            >
              ◈ TERMINAL
            </a>
            <a
              href="/memory"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#aa55ff', border: '1px solid #aa55ff66', padding: '5px 12px', textDecoration: 'none', background: '#aa55ff10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#aa55ff22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#aa55ff10')}
            >
              ◈ MEMORY
            </a>
            <a
              href="/memory/timeline"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#00ccff', border: '1px solid #00ccff66', padding: '5px 12px', textDecoration: 'none', background: '#00ccff10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#00ccff22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#00ccff10')}
            >
              ◈ TIMELINE
            </a>
            <a
              href="/rnd"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#00ccdd', border: '1px solid #00ccdd66', padding: '5px 12px', textDecoration: 'none', background: '#00ccdd10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#00ccdd22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#00ccdd10')}
            >
              ◈ R&D
            </a>
            
            <a
              href="/agency"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#f59e0b', border: '1px solid #f59e0b66', padding: '5px 12px', textDecoration: 'none', background: '#f59e0b10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f59e0b22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f59e0b10')}
            >
              ◈ AGENCY
            </a>
            <a
              href="/agents"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#4488ff', border: '1px solid #4488ff66', padding: '5px 12px', textDecoration: 'none', background: '#4488ff10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4488ff22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#4488ff10')}
            >
              ◈ AGENTS
            </a>
            <a
              href="/companies"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: '#22c55e', border: '1px solid #22c55e66', padding: '5px 12px', textDecoration: 'none', background: '#22c55e10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#22c55e22')}
              onMouseLeave={e => (e.currentTarget.style.background = '#22c55e10')}
            >
              ◈ COMPANIES
            </a>
            <a
              href="/openclaw"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: openclawStatus === 'ok' ? '#22c55e' : openclawStatus === 'fail' ? '#ef4444' : '#f59e0b', border: `1px solid ${openclawStatus === 'ok' ? '#22c55e66' : openclawStatus === 'fail' ? '#ef444466' : '#f59e0b66'}`, padding: '5px 12px', textDecoration: 'none', background: openclawStatus === 'ok' ? '#22c55e10' : openclawStatus === 'fail' ? '#ef444410' : '#f59e0b10', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = openclawStatus === 'ok' ? '#22c55e22' : openclawStatus === 'fail' ? '#ef444422' : '#f59e0b22')}
              onMouseLeave={e => (e.currentTarget.style.background = openclawStatus === 'ok' ? '#22c55e10' : openclawStatus === 'fail' ? '#ef444410' : '#f59e0b10')}
            >
              ◈ OPENCLAW
            </a>
            <select
              value={model}
              onChange={(e) => updateModel(e.target.value)}
              className="bg-[#06070d] text-[#a8b4c4] text-[11px] rounded-none px-2.5 py-1.5 border border-[#1c2230] outline-none cursor-pointer appearance-none pr-7 font-mono tracking-wider"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowImport(true)}
              className="bg-transparent hover:bg-[#1c2230] text-[#a8b4c4] text-[11px] px-3 py-1.5 rounded-none border border-[#1c2230] font-mono tracking-wider transition-colors"
            >
              + Add Skill
            </button>
            <button
              onClick={syncToGithub}
              disabled={syncing || !hasChanges}
              className="bg-transparent hover:bg-[#1c2230] text-[#a8b4c4] text-[11px] px-3 py-1.5 rounded-none border border-[#1c2230] font-mono tracking-wider transition-colors disabled:opacity-50"
            >
              {syncing ? 'Pushing...' : 'Push to GitHub'}
            </button>
          </div>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px_300px] min-h-0">

        {/* Column 1: Skills */}
        <div className="border-r border-zinc-800/50 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/30">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[10px] font-bold text-[#ff6600] uppercase tracking-[0.2em]">Skills</h2>
              <span className="text-[10px] text-zinc-600">{enabledCount} / {skills.length} enabled</span>
            </div>
            <span className="text-[10px] text-zinc-600">Timezone: {getLocalTzAbbr()}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {[...skills].sort((a, b) => Number(b.enabled) - Number(a.enabled)).map(skill => (
              <div key={skill.name} className={`border-b border-zinc-800/20 border-l-2 ${skill.enabled ? 'bg-green-950/10 border-l-green-500' : 'border-l-transparent'}`}>
                <div
                  onClick={() => setOpenSchedule(openSchedule === skill.name ? null : skill.name)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/50 transition-colors cursor-pointer"
                >
                  {/* Toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSkill(skill.name, !skill.enabled) }}
                    disabled={!!busy[skill.name]}
                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                      skill.enabled ? 'bg-[#00aa55]' : 'bg-zinc-700'
                    }`}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                      skill.enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                    }`} />
                  </button>

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <div className={`font-mono text-xs font-medium truncate ${skill.enabled ? 'text-green-300' : ''}`}>{skill.name}</div>
                    {skill.description && (
                      <div className="text-[10px] text-zinc-500 truncate max-w-[280px]">{skill.description}</div>
                    )}
                  </div>

                  {/* Schedule label */}
                  <span className={`text-[10px] px-2 py-1 rounded shrink-0 font-mono ${
                    openSchedule === skill.name
                      ? 'bg-zinc-700 text-zinc-200'
                      : skill.enabled
                        ? 'bg-green-900/30 text-green-400 border border-green-800/30'
                        : 'bg-zinc-800/60 text-zinc-500 border border-zinc-800/50'
                  }`}>
                    {cronLabel(skill.schedule)}
                  </span>

                  {/* Vars badge */}
                  {skill.var && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-800/50 truncate max-w-[120px] font-mono" title={skill.var}>
                      {skill.var}
                    </span>
                  )}

                  {/* Run */}
                  <button
                    onClick={(e) => { e.stopPropagation(); runSkill(skill.name, skill.var) }}
                    disabled={!!busy[`r-${skill.name}`] || (authStatus !== null && !authStatus.authenticated)}
                    title={authStatus !== null && !authStatus.authenticated ? 'Authenticate first' : undefined}
                    className="text-zinc-500 hover:text-zinc-300 text-[10px] px-2 py-1 rounded bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800/50 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {busy[`r-${skill.name}`] ? '\u00b7\u00b7\u00b7' : '\u25b6 Run'}
                  </button>
                </div>

                {/* Inline schedule + var editor */}
                {openSchedule === skill.name && (
                  <>
                    <ScheduleEditor
                      cron={skill.schedule}
                      onSave={(cron) => {
                        updateSchedule(skill.name, cron)
                        setOpenSchedule(null)
                      }}
                    />
                    <VarEditor
                      value={skill.var ?? ''}
                      onSave={(v) => updateVar(skill.name, v)}
                    />
                    <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-800/30 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Delete skill "${skill.name}"? This removes the skill folder and config.`)) deleteSkill(skill.name) }}
                        disabled={!!busy[`d-${skill.name}`]}
                        className="text-[10px] text-red-400/60 hover:text-red-400 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {busy[`d-${skill.name}`] ? 'Deleting...' : 'Delete skill'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Secrets */}
        <div className="border-r border-zinc-800/50 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/30">
            <h2 className="text-[10px] font-bold text-[#ff6600] uppercase tracking-[0.2em]">Secrets</h2>
            <span className="text-[10px] text-zinc-600">{secretsSet} / {secrets.length} set</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {['Core', 'Telegram', 'Discord', 'Slack', 'Skill Keys'].map(group => {
              const groupSecrets = secrets.filter(s => s.group === group)
              if (groupSecrets.length === 0) return null
              return (
                <div key={group}>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">{group}</span>
                  </div>
                  {groupSecrets.map((secret, i) => {
                    const eitherSibling = secret.either
                      ? groupSecrets.find(s => s.either === secret.either && s.name !== secret.name)
                      : null
                    const siblingIsSet = eitherSibling?.isSet ?? false
                    const dimmed = !secret.isSet && siblingIsSet
                    // Show "or" divider between either-grouped secrets
                    const prevSecret = i > 0 ? groupSecrets[i - 1] : null
                    const showOr = secret.either && prevSecret?.either === secret.either

                    return (<div key={secret.name}>
                    {showOr && (
                      <div className="flex items-center gap-2 px-4 py-0.5">
                        <div className="flex-1 border-t border-zinc-800/40" />
                        <span className="text-[9px] text-zinc-600 uppercase tracking-wider">or</span>
                        <div className="flex-1 border-t border-zinc-800/40" />
                      </div>
                    )}
                    <div className={`px-4 py-2 border-b border-zinc-800/20 hover:bg-zinc-900/50 transition-colors ${dimmed ? 'opacity-40' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs truncate">{secret.name}</span>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              secret.isSet ? 'bg-green-500' : 'bg-zinc-600'
                            }`} />
                          </div>
                          <div className="text-[10px] text-zinc-600">{secret.description}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!secret.isSet && editingSecret !== secret.name && (
                            <button
                              onClick={() => {
                                setEditingSecret(secret.name)
                                setSecretValue('')
                              }}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded transition-colors"
                            >
                              set
                            </button>
                          )}
                          {editingSecret === secret.name && (
                            <button
                              onClick={() => { setEditingSecret(null); setSecretValue('') }}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded transition-colors"
                            >
                              cancel
                            </button>
                          )}
                          {secret.isSet && editingSecret !== secret.name && (
                            <button
                              onClick={() => deleteSecret(secret.name)}
                              disabled={!!busy[`sec-${secret.name}`]}
                              className="text-[10px] text-red-400/50 hover:text-red-400 px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                            >
                              delete
                            </button>
                          )}
                        </div>
                      </div>
                      {editingSecret === secret.name && (
                        <div className="flex gap-1.5 mt-2">
                          <input
                            type="password"
                            value={secretValue}
                            onChange={(e) => setSecretValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveSecret(secret.name)}
                            placeholder="paste value..."
                            autoFocus
                            className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-700/50 outline-none placeholder:text-zinc-600 font-mono"
                          />
                          <button
                            onClick={() => saveSecret(secret.name)}
                            disabled={!secretValue.trim() || !!busy[`sec-${secret.name}`]}
                            className="bg-[#ff6600]/20 hover:bg-[#ff6600]/30 text-[#ff6600] text-[10px] px-2 py-1 rounded-none border border-[#ff6600]/50 transition-colors disabled:opacity-50"
                          >
                            {busy[`sec-${secret.name}`] ? '\u00b7\u00b7\u00b7' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>)
                  })}
                </div>
              )
            })}
            {/* Add custom secret */}
            <div className="px-4 py-3">
              {addingSecret ? (
                <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={newSecretName}
                    onChange={(e) => setNewSecretName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="SECRET_NAME"
                    autoFocus
                    className="w-full bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1.5 border border-zinc-700/50 outline-none placeholder:text-zinc-600 font-mono"
                  />
                  {newSecretName && (
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={secretValue}
                        onChange={(e) => setSecretValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && newSecretName && secretValue.trim() && saveSecret(newSecretName)}
                        placeholder="paste value..."
                        className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 border border-zinc-700/50 outline-none placeholder:text-zinc-600 font-mono"
                      />
                      <button
                        onClick={() => saveSecret(newSecretName)}
                        disabled={!secretValue.trim()}
                        className="bg-[#ff6600]/20 hover:bg-[#ff6600]/30 text-[#ff6600] text-[10px] px-2 py-1 rounded-none border border-[#ff6600]/50 transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => { setAddingSecret(false); setNewSecretName(''); setSecretValue('') }}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors self-start"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSecret(true)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  + Add Secret
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Runs */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/30">
            <h2 className="text-[10px] font-bold text-[#ff6600] uppercase tracking-[0.2em]">Runs</h2>
            <button onClick={fetchData} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              refresh
            </button>
          </div>
          {selectedRun ? (
            /* Log viewer */
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/30 shrink-0">
                <button
                  onClick={() => { setSelectedRun(null); setRunLogs(''); setRunSummary(''); setShowFullLogs(false) }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                >
                  &larr;
                </button>
                <span className={`text-xs font-mono ${
                  selectedRun.conclusion === 'success' ? 'text-green-400' :
                  selectedRun.conclusion === 'failure' ? 'text-red-400' :
                  selectedRun.status === 'in_progress' ? 'text-[#ff6600]' :
                  'text-zinc-600'
                }`}>
                  {selectedRun.conclusion === 'success' ? '\u2713' :
                   selectedRun.conclusion === 'failure' ? '\u2717' :
                   selectedRun.status === 'in_progress' ? '\u25cc' : '\u00b7'}
                </span>
                <span className="font-mono text-xs text-zinc-300 truncate flex-1">{selectedRun.workflow}</span>
                <a
                  href={selectedRun.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-800/50 transition-colors shrink-0"
                >
                  Open on GitHub
                </a>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-8 w-8 rounded-full border border-[#ff6600]/20" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
                      <div className="h-2 w-2 rounded-full bg-[#ff6600] shadow-[0_0_8px_rgba(255,102,0,0.4)]" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {runSummary ? (
                      <pre className="text-[11px] leading-relaxed font-mono text-zinc-300 whitespace-pre-wrap break-words">
                        {runSummary.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/gm, '')}
                      </pre>
                    ) : (
                      <p className="text-[11px] text-zinc-600 italic">No summary available</p>
                    )}
                    <button
                      onClick={() => setShowFullLogs(!showFullLogs)}
                      className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
                    >
                      <span className="transform transition-transform" style={{ display: 'inline-block', transform: showFullLogs ? 'rotate(90deg)' : 'rotate(0deg)' }}>&rsaquo;</span>
                      Full logs
                    </button>
                    {showFullLogs && (
                      <pre className="text-[11px] leading-relaxed font-mono text-zinc-500 whitespace-pre-wrap break-words border-t border-zinc-800/30 pt-3">
                        {runLogs.replace(/\x1b\[[0-9;]*m/g, '')}
                      </pre>
                    )}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Run list */
            <div className="flex-1 overflow-y-auto">
              {runs.length === 0 ? (
                <div className="px-4 py-12 text-center text-zinc-600 text-xs">
                  No runs yet
                </div>
              ) : (
                runs.map(run => (
                  <button
                    key={run.id}
                    onClick={() => viewRunLogs(run)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/20 hover:bg-zinc-900/50 transition-colors text-left"
                  >
                    <span className={`text-xs font-mono ${
                      run.conclusion === 'success' ? 'text-green-400' :
                      run.conclusion === 'failure' ? 'text-red-400' :
                      run.status === 'in_progress' ? 'text-[#ff6600]' :
                      'text-zinc-600'
                    }`}>
                      {run.conclusion === 'success' ? '\u2713' :
                       run.conclusion === 'failure' ? '\u2717' :
                       run.status === 'in_progress' ? '\u25cc' : '\u00b7'}
                    </span>
                    <span className="font-mono text-xs text-zinc-300 truncate flex-1">{run.workflow}</span>
                    <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{timeAgo(run.created_at)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#06070d] border border-[#1c2230] rounded-none w-full max-w-md mx-4 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#ff6600]">Upload Skill</h2>
              <button
                onClick={() => { setShowImport(false); setUploadFiles([]); setUploadName('') }}
                className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && readFilesFromInput(e.target.files)}
            />
            <input
              ref={(el) => { if (el) el.setAttribute('webkitdirectory', '') }}
              type="file"
              className="hidden"
              id="folder-input"
              onChange={(e) => e.target.files && readFilesFromInput(e.target.files)}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-none p-8 text-center transition-colors ${
                uploadDragOver ? 'border-[#ff6600] bg-[#ff6600]/10' : 'border-[#1c2230] hover:border-[#2a3040]'
              }`}
            >
              {uploadFiles.length === 0 ? (
                <>
                  <div className="text-zinc-500 text-sm mb-3">
                    Drag & drop a skill folder here, or
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-transparent hover:bg-[#1c2230] text-[#a8b4c4] text-[11px] px-3 py-1.5 rounded-none border border-[#1c2230] font-mono tracking-wider transition-colors"
                    >
                      Choose Files
                    </button>
                    <button
                      onClick={() => document.getElementById('folder-input')?.click()}
                      className="bg-transparent hover:bg-[#1c2230] text-[#a8b4c4] text-[11px] px-3 py-1.5 rounded-none border border-[#1c2230] font-mono tracking-wider transition-colors"
                    >
                      Choose Folder
                    </button>
                  </div>
                  <div className="text-zinc-600 text-[10px] mt-3">
                    Must include a SKILL.md or .skill file
                  </div>
                </>
              ) : (
                <>
                  <div className="text-zinc-300 text-sm mb-1">
                    {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-zinc-500 text-xs mb-3 max-h-24 overflow-y-auto font-mono">
                    {uploadFiles.map(f => f.path).join(', ')}
                  </div>
                  <button
                    onClick={() => { setUploadFiles([]); setUploadName(''); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>

            {uploadFiles.length > 0 && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Skill name (optional — auto-detected from folder or SKILL.md)</label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder={uploadFiles[0]?.path.split('/')[0] || 'my-skill'}
                    className="w-full bg-[#06070d] text-[#d8e4f0] text-[11px] rounded-none px-3 py-2 border border-[#1c2230] outline-none placeholder:text-[#2e3848] font-mono"
                  />
                </div>
                <button
                  onClick={uploadSkill}
                  disabled={importLoading}
                  className="w-full bg-[#ff6600]/20 hover:bg-[#ff6600]/30 text-[#ff6600] text-[11px] py-2.5 rounded-none border border-[#ff6600]/50 font-mono tracking-wider transition-colors disabled:opacity-50"
                >
                  {importLoading ? 'Uploading...' : 'Upload Skill'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LLM Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowConnectModal(false)}>
          <div className="bg-[#06070d] border border-[#1c2230] w-full max-w-lg mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#ff6600]">◈ LLM Connect</h2>
                <p className="font-mono text-[9px] text-[#2e3848] mt-0.5 tracking-wider">Keys stored as GitHub Actions secrets</p>
              </div>
              <button onClick={() => setShowConnectModal(false)} className="text-zinc-600 hover:text-[#a8b4c4] text-lg leading-none transition-colors">&times;</button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {llmProviders.map(p => (
                <div key={p.id} className="bg-[#04040a] border border-[#12161e] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ color: p.connected ? '#00ff88' : '#2e3848', fontSize: 8 }}>●</span>
                      <span className="font-mono text-[11px] tracking-wider" style={{ color: p.connected ? '#d8e4f0' : '#a8b4c4' }}>{p.name.toUpperCase()}</span>
                      {p.autoDetectable && <span className="font-mono text-[8px] text-[#2e3848] border border-[#12161e] px-1">AUTO</span>}
                      {p.connected && <span className="font-mono text-[8px] text-[#00ff8860]">connected</span>}
                    </div>
                    <button
                      onClick={() => connectProvider(p.id)}
                      disabled={!!llmLoading[p.id]}
                      className="font-mono text-[9px] tracking-wider px-3 py-1 border transition-colors disabled:opacity-40"
                      style={{ color: p.connected ? '#a8b4c4' : '#ff6600', borderColor: p.connected ? '#1c2230' : '#ff660050', background: p.connected ? 'transparent' : '#ff660010' }}
                    >
                      {llmLoading[p.id] ? '...' : p.connected ? 'RECONNECT' : 'CONNECT'}
                    </button>
                  </div>
                  {llmKeyVisible.has(p.id) && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={llmKeyInputs[p.id] || ''}
                        onChange={e => setLlmKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && (llmKeyInputs[p.id] || '').trim() && connectProvider(p.id, llmKeyInputs[p.id].trim())}
                        placeholder={p.keyPlaceholder}
                        autoFocus
                        className="flex-1 bg-[#06070d] text-[#d8e4f0] text-[10px] rounded-none px-2 py-1.5 border border-[#1c2230] outline-none placeholder:text-[#2e3848] font-mono"
                      />
                      <button
                        onClick={() => connectProvider(p.id, (llmKeyInputs[p.id] || '').trim())}
                        disabled={!(llmKeyInputs[p.id] || '').trim() || !!llmLoading[p.id]}
                        className="font-mono text-[9px] px-3 py-1 border border-[#ff660050] text-[#ff6600] bg-[#ff660010] hover:bg-[#ff660020] transition-colors disabled:opacity-40"
                      >
                        SAVE
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {llmProviders.length === 0 && (
                <div className="text-center py-6 font-mono text-[10px] text-[#2e3848]">Loading providers...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
